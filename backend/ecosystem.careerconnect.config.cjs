module.exports = {
  apps: [
    {
      name: "WM-CareerConnect-API",
      script: "dist/server.js",
      cwd: "D:/WM Apps/2026 Applications/WM_CareerConnect/backend",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: "5001"
      }
    }
  ]
};
