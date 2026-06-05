import type { ServiceVersionEntry } from '../types';

const FILES = 'https://files.phpmyadmin.net/phpMyAdmin';

export const PHPMYADMIN_STATIC_VERSIONS: ServiceVersionEntry[] = [
  {
    version: '5.2.3',
    label: 'phpMyAdmin 5.2.3',
    url: `${FILES}/5.2.3/phpMyAdmin-5.2.3-all-languages.zip`,
    sizeBytes: 16_500_000,
    rootFolder: 'phpMyAdmin-5.2.3-all-languages',
  },
  {
    version: '5.2.2',
    label: 'phpMyAdmin 5.2.2',
    url: `${FILES}/5.2.2/phpMyAdmin-5.2.2-all-languages.zip`,
    sizeBytes: 16_000_000,
    rootFolder: 'phpMyAdmin-5.2.2-all-languages',
  },
  {
    version: '5.2.1',
    label: 'phpMyAdmin 5.2.1',
    url: `${FILES}/5.2.1/phpMyAdmin-5.2.1-all-languages.zip`,
    sizeBytes: 15_500_000,
    rootFolder: 'phpMyAdmin-5.2.1-all-languages',
  },
  {
    version: '5.2.0',
    label: 'phpMyAdmin 5.2.0',
    url: `${FILES}/5.2.0/phpMyAdmin-5.2.0-all-languages.zip`,
    sizeBytes: 15_000_000,
    rootFolder: 'phpMyAdmin-5.2.0-all-languages',
  },
];
