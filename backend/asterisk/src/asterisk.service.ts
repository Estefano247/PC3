import { Injectable, Logger } from '@nestjs/common';
import { SshService } from './ssh.service';
import { Extension } from './interfaces/extension.interface';
import { CreateExtensionDto } from './dto/create-extension.dto';

const PJSIP_CONF = process.env.PJSIP_CONF_PATH || '/etc/asterisk/pjsip.conf';

@Injectable()
export class AsteriskService {
  private readonly logger = new Logger(AsteriskService.name);

  constructor(private readonly ssh: SshService) {}

  async getExtensions(): Promise<Extension[]> {
    const content = await this.ssh.executeCommand(`cat "${PJSIP_CONF}"`);
    return this.parseExtensions(content);
  }

  private parseExtensions(content: string): Extension[] {
    const extensions: Extension[] = [];
    const blocks = content.split(/\n(?=\[)/);

    for (const block of blocks) {
      const headerMatch = block.match(/^\[(\d+)\]/);
      if (!headerMatch) continue;

      const lines = block.split('\n');
      const props: Record<string, string> = {};
      for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();
        props[key] = val;
      }

      if (props.type === 'endpoint') {
        extensions.push({
          extension: headerMatch[1],
          username: props.username || headerMatch[1],
          displayName: props.callerid || '',
          context: props.context || '',
          transport: props.transport || '',
          webrtc: props.webrtc || '',
          authType: '',
        });
      }
    }

    return extensions;
  }

  async createExtension(dto: CreateExtensionDto): Promise<void> {
    const { username, extension, password } = dto;
    const displayName = dto.displayName || username;

    const checkCmd = `grep -q "^\\[${extension}\\]" "${PJSIP_CONF}" && echo "EXISTS" || echo "NOT_FOUND"`;
    const result = await this.ssh.executeCommand(checkCmd);

    if (result.includes('EXISTS')) {
      throw new Error(`Extension ${extension} already exists`);
    }

    const configBlock = `[${extension}]
type = endpoint
context = callcenter
disallow = all
allow = ulaw
allow = opus
auth = ${extension}-auth
aors = ${extension}
callerid = "${displayName}" <${extension}>
webrtc = yes
transport = transport-ws
identify_by = username
direct_media = no

[${extension}-auth]
type = auth
auth_type = userpass
password = ${password}
username = ${extension}

[${extension}]
type = aor
max_contacts = 1
`;

    const b64 = Buffer.from(configBlock).toString('base64');
    await this.ssh.executeCommand(
      `echo '${b64}' | base64 -d >> "${PJSIP_CONF}"`,
    );
    await this.reload();
    this.logger.log(`Extension ${extension} provisioned successfully`);
  }

  async removeExtension(extension: string): Promise<void> {
    const escaped = extension.replace(/[^a-zA-Z0-9_-]/g, '');
    const cmd = `sed -i "/^\\[${escaped}\\]/,/^$/d" "${PJSIP_CONF}"`;
    await this.ssh.executeCommand(cmd);
    await this.reload();
    this.logger.log(`Extension ${extension} removed successfully`);
  }

  async getStatus(): Promise<any> {
    const [uptime, version, calls] = await Promise.all([
      this.ssh.executeCommand('sudo /usr/sbin/asterisk -rx "core show uptime"'),
      this.ssh.executeCommand('sudo /usr/sbin/asterisk -rx "core show version"'),
      this.ssh.executeCommand('sudo /usr/sbin/asterisk -rx "core show calls"'),
    ]);
    return {
      uptime: uptime.replace('\n', '; '),
      version: version.replace('\n', '; '),
      calls: calls.replace('\n', '; '),
    };
  }

  async reload(): Promise<string> {
    const result = await this.ssh.executeCommand(
      'sudo /usr/sbin/asterisk -rx "module reload res_pjsip.so"',
    );
    return result;
  }
}
