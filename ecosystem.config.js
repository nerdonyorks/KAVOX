module.exports = {
  apps: [
    {
      name: "kavox-server",
      script: "./server.js",
      // Run the application in cluster mode to use all CPU cores
      instances: "max",
      exec_mode: "cluster",
      // Restart the application automatically if it crashes
      autorestart: true,
      // Do not watch files in production to avoid random restarts (e.g. on log/temp write)
      watch: false,
      // Restart if memory usage exceeds 1GB
      max_memory_restart: "1G",
      // Redirect logs to separate output and error log files
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      // Include timestamp formatting in logs
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // Combine logs from all cluster instances into the same log files
      combine_logs: true,
      merge_logs: true,
      // Default environment variables
      env: {
        NODE_ENV: "development",
        PORT: 3000
      },
      // Production environment variables activated by --env production
      env_production: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
