import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  username: string;

  @Column({ name: 'full_name', length: 100 })
  fullName: string;

  @Column({ length: 100, nullable: true })
  email: string;

  @Column({ length: 50, default: 'AgenteCallCenter' })
  role: string;

  @Column({ name: 'sip_extension', length: 10, nullable: true })
  sipExtension: string;

  @Column({ name: 'sip_password', length: 64, nullable: true })
  sipPassword: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ name: 'password_hash', length: 255, nullable: true })
  passwordHash: string;

  @Column({ name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
