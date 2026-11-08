import { lookup } from 'node:dns/promises';
import { BlockList } from 'node:net';
import { z } from 'zod';

export const smtpSettingsSchema = z.object({
  host: z.string().trim().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i),
  port: z.number().int().min(1).max(65535),
  user: z.string().trim().max(320).optional(),
  password: z.string().max(1024).optional(),
  aliases: z.array(z.string().trim().max(254).email()).max(20).optional(),
});

export type SmtpSettings = z.infer<typeof smtpSettingsSchema>;

export interface SmtpCredentials {
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_aliases?: string[];
}

export function smtpCredentials(settings: SmtpSettings, existing: SmtpCredentials | undefined, imapUser?: string, imapPassword?: string) {
  return {
    smtp_public_only: true,
    smtp_host: settings.host,
    smtp_port: settings.port,
    smtp_user: settings.user || imapUser || existing?.smtp_user,
    smtp_pass: settings.password || imapPassword || existing?.smtp_pass,
    smtp_aliases: settings.aliases === undefined ? existing?.smtp_aliases ?? []
      : [...new Map(settings.aliases.map((address) => [address.toLowerCase(), address])).values()],
  };
}

const privateAddresses = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) {
  privateAddresses.addSubnet(address, prefix, 'ipv4');
}
privateAddresses.addSubnet('2001:db8::', 32, 'ipv6');
const globalIPv6 = new BlockList();
globalIPv6.addSubnet('2000::', 3, 'ipv6');

export async function resolveSmtpHost(host: string): Promise<string> {
  const addresses = await lookup(host, { all: true });
  const isPublic = ({ address, family }: { address: string; family: number }) =>
    family === 4 ? !privateAddresses.check(address, 'ipv4')
      : globalIPv6.check(address, 'ipv6') && !privateAddresses.check(address, 'ipv6');
  if (!addresses.length || addresses.some((address) => !isPublic(address))) {
    throw new Error('SMTP 服务器必须使用公网地址');
  }
  return addresses.find((address) => address.family === 4)?.address ?? addresses[0].address;
}
