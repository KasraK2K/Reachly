import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Email, Password, publicUser } from './auth.controller';
import { Auth, found, parse, UserId } from './http';
import { hashPassword } from './password';
import { PrismaService } from './prisma.service';

const Role = z.enum(['Admin', 'Member']);
const Name = z.string().trim().max(100).optional();

@Controller('users')
@Auth('admin')
export class UsersController {
  constructor(private db: PrismaService) {}

  @Get()
  async list() {
    const users = await this.db.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((u) => ({ ...publicUser(u), createdAt: u.createdAt }));
  }

  /** No password = the user can only sign in with Google using this email. */
  @Post()
  async create(@Body() body: unknown) {
    const { email, name, role, password } = parse(z.object({ email: Email, name: Name, role: Role.default('Member'), password: Password.optional() }), body);
    if (await this.db.user.findUnique({ where: { email } })) throw new ConflictException('A user with this email already exists');
    const user = await this.db.user.create({
      data: { email, name: name || null, role, passwordHash: password ? await hashPassword(password) : null },
    });
    return publicUser(user);
  }

  @Patch(':id')
  async update(@UserId() me: string, @Param('id') id: string, @Body() body: unknown) {
    const data = parse(z.object({ name: Name, role: Role.optional(), password: Password.optional() }), body);
    const user = found(await this.db.user.findUnique({ where: { id } }), 'User');
    if (data.role === 'Member' && user.role === 'Admin') {
      if (id === me) throw new BadRequestException("You can't remove your own admin role");
      if ((await this.db.user.count({ where: { role: 'Admin' } })) <= 1) throw new BadRequestException('At least one admin is required');
    }
    const updated = await this.db.user.update({
      where: { id },
      data: { name: data.name, role: data.role, ...(data.password && { passwordHash: await hashPassword(data.password) }) },
    });
    return publicUser(updated);
  }

  /** Deletes the user and everything they own (leads, templates, campaigns, accounts). */
  @Delete(':id')
  async remove(@UserId() me: string, @Param('id') id: string) {
    if (id === me) throw new BadRequestException("You can't delete your own account");
    found(await this.db.user.findUnique({ where: { id } }), 'User');
    await this.db.user.delete({ where: { id } });
    return { ok: true };
  }
}
