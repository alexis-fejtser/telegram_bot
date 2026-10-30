module.exports = {
  apps: [
    {
      name: 'tgbot',
      script: 'src/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
      },
      max_memory_restart: '500M',
      autorestart: true,
      restart_delay: 3000,
      time: true,
    },
  ],
};
