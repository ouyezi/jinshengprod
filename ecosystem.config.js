module.exports = {
  apps: [
    {
      name: 'jinsheng-backend',
      cwd: '/Users/dongfuxlab/workspace/jinshengprod/backend',
      script: '/Users/dongfuxlab/workspace/jinshengprod/backend/.venv/bin/python3',
      args: '-m uvicorn app.main:app --host 0.0.0.0 --port 8000',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      min_uptime: '10s',
      max_restarts: 10,
      listen_timeout: 8000,
      kill_timeout: 5000,
      max_memory_restart: '512M',
      // 每天凌晨 3 点自动重启，释放内存、刷新连接
      cron_restart: '0 3 * * *',
      log_file: '/Users/dongfuxlab/workspace/jinshengprod/logs/pm2-backend.log',
      out_file: '/Users/dongfuxlab/workspace/jinshengprod/logs/pm2-backend-out.log',
      error_file: '/Users/dongfuxlab/workspace/jinshengprod/logs/pm2-backend-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
