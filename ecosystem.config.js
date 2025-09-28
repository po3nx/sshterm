module.exports = {
  apps: [{
    name: 'ssh2',
    script: 'dist/server/index.js',
    instances: 1, // or 'max' for cluster mode
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      HOST: '0.0.0.0'
    },
    // Logging
    log_file: 'logs/combined.log',
    out_file: 'logs/out.log',
    error_file: 'logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm Z',
    
    // Auto-restart on crashes
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};
