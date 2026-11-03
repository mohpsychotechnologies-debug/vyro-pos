// PM2 process manager config
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup   (to auto-start on reboot)

module.exports = {
  apps: [
    {
      name: 'vyro-mpesa',
      script: './backend/server.js',
      cwd: '/var/www/vyro-pos',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // Log files
      out_file: '/var/log/vyro-pos/out.log',
      error_file: '/var/log/vyro-pos/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
