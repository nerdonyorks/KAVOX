# Kavox Application

Kavox is a unified Node.js / Express MVC web application utilizing MongoDB for session and data persistence, and EJS for dynamic views.

---

## Production Process Management with PM2

PM2 is used to manage, cluster, and keep the application running in production environments. Because user sessions are stored in MongoDB via `connect-mongo`, we can safely scale the server across all CPU cores using PM2's cluster mode without session affinity issues.

### PM2 Configuration

The PM2 behavior is defined in [ecosystem.config.js](file:///home/nerdonyorks/Documents/VisualStudio/Kavox/ecosystem.config.js):

- **Process Name**: `kavox-server`
- **Execution Mode**: `cluster` (`instances: "max"`)
- **Auto-Restart**: Automatically restarts if the application crashes (`autorestart: true`)
- **Memory Threshold**: Restarts if memory usage exceeds `1GB` (`max_memory_restart: "1G"`)
- **Log Files**: Separate error and output logs located in the `logs/` directory

---

### Process Control Commands

A set of convenient npm scripts are configured in `package.json` to control the PM2 process manager:

#### 1. Start the Application
Starts the application in production mode under PM2:
```bash
npm run pm2:start
```

#### 2. Stop the Application
Stops the running processes:
```bash
npm run pm2:stop
```

#### 3. Restart the Application
Performs a zero-downtime hot restart of the cluster instances:
```bash
npm run pm2:restart
```

#### 4. Monitor Status
Lists all running processes, their status, CPU, and memory usage:
```bash
npm run pm2:status
```

#### 5. Real-Time Log Streaming
Streams application output and error logs in real-time:
```bash
npm run pm2:logs
```

#### 6. PM2 Dashboard Terminal
Opens the interactive terminal dashboard showing metrics, logs, and processes:
```bash
npm run pm2:monit
```

---

### PM2 Log Management

Logs are automatically routed and saved to separate files:
- **Output / Standard Logs**: `logs/pm2-out.log`
- **Error / Exception Logs**: `logs/pm2-error.log`

The local `logs/` directory is ignored in Git via `.gitignore` to prevent production server logs from polluting the repository.

---

### Server Boot Auto-Start (Reboot Persistence)

To ensure the Kavox application starts automatically after a server reboot, set up PM2 startup scripts as follows:

1. **Generate the Startup configuration command**:
   ```bash
   npx pm2 startup
   ```
   *This command will output a configuration instruction containing a `sudo env PATH=... pm2 startup systemd -u ... --hp ...` command tailored to your system.*

2. **Execute the generated command**:
   Copy and paste the exact command output from the previous step into your terminal and run it using `sudo`.

3. **Save the current process list**:
   Once the startup configuration is active, start your application (using `npm run pm2:start`) and run:
   ```bash
   npx pm2 save
   ```
   *This saves the current PM2 process list so it can be restored on boot.*

4. **Verify / Test startup configuration**:
   To test if the startup unit works without actually rebooting the server:
   ```bash
   sudo systemctl status pm2-<username>
   ```
