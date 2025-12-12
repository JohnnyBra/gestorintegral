module.exports = {
  apps: [{
    name: "gestion-escolar",
    script: "./server.js",
    watch: false,
    env: {
      NODE_ENV: "production",
      PORT: 3002
    }
  }]
};
