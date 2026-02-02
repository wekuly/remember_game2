/**
 * PM2 설정 (서버 상시 실행)
 * 사용: npm run pm2:start / pm2:stop / pm2:restart
 * 또는: npx pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: "remember_game2",
      script: "dist-server/server.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: { NODE_ENV: "production" },
      env_development: { NODE_ENV: "development" },
    },
  ],
};
