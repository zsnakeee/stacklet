/**
 * Bundled translation resources. English is the source/fallback; Arabic also
 * exercises the RTL layout path. Add a language by appending a block here and an
 * entry to LANGUAGES in i18n.tsx — missing keys fall back to English.
 */
export const resources = {
  en: {
    translation: {
      nav: {
        dashboard: 'Dashboard',
        sites: 'Sites',
        services: 'Services',
        logs: 'Logs',
        mailpit: 'Mailpit',
        settings: 'Settings',
      },
      title: {
        service: 'Service',
        site: 'Site',
      },
      sidebar: {
        tagline: 'Your local stack',
        project: 'Project',
        projects: 'Projects',
        noProjects: 'No projects yet',
        loading: 'Loading…',
        error: 'Error',
        collapse: 'Collapse sidebar',
        expand: 'Expand sidebar',
      },
      titlebar: {
        toLight: 'Switch to light theme',
        toDark: 'Switch to dark theme',
        language: 'Language',
        minimize: 'Minimize',
        maximize: 'Maximize',
        restore: 'Restore',
        close: 'Close',
      },
      settings: {
        language: {
          title: 'Language',
          label: 'Display language',
          hint: 'Changes the interface language. Right-to-left languages (e.g. Arabic) flip the layout automatically.',
        },
        node: {
          title: 'Node.js (nvm)',
          hint: 'Manage global Node versions with nvm-windows. Projects with a .nvmrc use their pinned version in the site terminal automatically.',
          notInstalled:
            'nvm-windows was not found on PATH. Install it from github.com/coreybutler/nvm-windows, then reopen Stacklet.',
          installed: 'Installed versions',
          current: 'in use',
          use: 'Use',
          install: 'Install',
          installPlaceholder: 'e.g. 20.11.0 or lts',
          available: 'Available to install',
          refresh: 'Refresh',
          loading: 'Querying nvm…',
        },
      },
    },
  },
  ar: {
    translation: {
      nav: {
        dashboard: 'لوحة التحكم',
        sites: 'المواقع',
        services: 'الخدمات',
        logs: 'السجلات',
        mailpit: 'البريد',
        settings: 'الإعدادات',
      },
      title: {
        service: 'خدمة',
        site: 'موقع',
      },
      sidebar: {
        tagline: 'بيئتك المحلية',
        project: 'مشروع',
        projects: 'مشاريع',
        noProjects: 'لا توجد مشاريع بعد',
        loading: 'جارٍ التحميل…',
        error: 'خطأ',
        collapse: 'طيّ الشريط الجانبي',
        expand: 'توسيع الشريط الجانبي',
      },
      titlebar: {
        toLight: 'التبديل إلى الوضع الفاتح',
        toDark: 'التبديل إلى الوضع الداكن',
        language: 'اللغة',
        minimize: 'تصغير',
        maximize: 'تكبير',
        restore: 'استعادة',
        close: 'إغلاق',
      },
      settings: {
        language: {
          title: 'اللغة',
          label: 'لغة الواجهة',
          hint: 'تغيّر لغة الواجهة. اللغات التي تُكتب من اليمين إلى اليسار (مثل العربية) تقلب التخطيط تلقائياً.',
        },
        node: {
          title: 'نود (nvm)',
          hint: 'إدارة إصدارات نود العامة عبر nvm-windows. المشاريع التي تحتوي على ملف ‎.nvmrc‎ تستخدم إصدارها المثبّت في طرفية الموقع تلقائياً.',
          notInstalled:
            'لم يُعثر على nvm-windows في مسار النظام. ثبّته من github.com/coreybutler/nvm-windows ثم أعد فتح Stacklet.',
          installed: 'الإصدارات المثبّتة',
          current: 'قيد الاستخدام',
          use: 'استخدام',
          install: 'تثبيت',
          installPlaceholder: 'مثال: 20.11.0 أو lts',
          available: 'متاح للتثبيت',
          refresh: 'تحديث',
          loading: 'جارٍ الاستعلام من nvm…',
        },
      },
    },
  },
} as const;
