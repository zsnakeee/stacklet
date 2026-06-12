import fs from 'fs';
import { parse, stringify } from 'smol-toml';
import { ensureDataLayout, getConfigPath } from '../shared/paths';
import { defaultConfig } from './defaults';
import type { DevConfig } from './types';

export function loadConfig(): DevConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return defaultConfig();
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = parse(raw) as Partial<DevConfig>;
  return mergeWithDefaults(parsed);
}

export function saveConfig(config: DevConfig): void {
  ensureDataLayout();
  fs.writeFileSync(getConfigPath(), stringify(config), 'utf8');
}

export function initConfig(): DevConfig {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    return loadConfig();
  }
  const config = defaultConfig();
  saveConfig(config);
  return config;
}

function mergeWithDefaults(partial: Partial<DevConfig>): DevConfig {
  const base = defaultConfig();
  return {
    version: partial.version ?? base.version,
    general: {
      ...base.general,
      ...partial.general,
      web_server: partial.general?.web_server === 'apache' ? 'apache' : 'nginx',
    },
    services: {
      nginx: {
        ...base.services.nginx,
        ...partial.services?.nginx,
        options: {
          ...base.services.nginx.options,
          ...partial.services?.nginx?.options,
        },
      },
      apache: { ...base.services.apache, ...partial.services?.apache },
      php: { ...base.services.php, ...partial.services?.php },
      mysql: {
        ...base.services.mysql,
        ...partial.services?.mysql,
        options: {
          ...base.services.mysql.options,
          ...partial.services?.mysql?.options,
        },
      },
      postgres: { ...base.services.postgres, ...partial.services?.postgres },
      nodejs: { ...base.services.nodejs, ...partial.services?.nodejs },
      redis: { ...base.services.redis, ...partial.services?.redis },
      phpmyadmin: {
        ...base.services.phpmyadmin,
        ...partial.services?.phpmyadmin,
        options: {
          ...base.services.phpmyadmin.options,
          ...partial.services?.phpmyadmin?.options,
        },
      },
      mailpit: { ...base.services.mailpit, ...partial.services?.mailpit },
      mongodb: { ...base.services.mongodb, ...partial.services?.mongodb },
      python: { ...base.services.python, ...partial.services?.python },
    },
  };
}
