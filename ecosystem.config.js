module.exports = {
  apps: [
    {
      name: 'qpay_payment_backend',
      cwd: '/home/ec2-user/qpay_payment',
      script: 'dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 10,
    //   env: {
    //     NODE_ENV: 'development',
    //     PORT: 3000,
    //   },
    //   env_production: {
    //     NODE_ENV: 'production',
    //     PORT: 3000,
    //   },
      error_file: './logs/pm2/error.log',
      out_file: './logs/pm2/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z',
    },
  ],
};
