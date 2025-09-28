# SSH Terminal - React TypeScript Edition

A modern, secure web-based SSH terminal application built with React TypeScript and Clean Architecture principles. This project provides a full-featured terminal interface for SSH connections through a web browser.

![SSH Terminal](https://img.shields.io/badge/SSH-Terminal-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.2+-blue)
![React](https://img.shields.io/badge/React-18.3+-blue)
![Clean Architecture](https://img.shields.io/badge/Architecture-Clean-green)

## ✨ Features

- 🔐 Secure SSH connections (SSH2) with username/password auth
- ⚡ Real-time terminal via XTerm.js with PTY resize support
- 🔄 Socket.IO communication with robust dev/prod handling
- 🧑‍💻 User-selectable SSH Host/Port in login form
- 🧱 Clean Architecture (domain/application/infrastructure/presentation)
- 🛡️ Secure defaults: Helmet CSP, no inline scripts in index.html
- 🌐 Multi-origin CORS support for Socket.IO/Express (comma-separated CLIENT_URL)
- 🧰 TypeScript end-to-end, strict mode enabled
- 📱 Responsive UI and accessible interactions

## 🏗️ Architecture

This project follows Clean Architecture principles with clear separation of concerns:

```
src/
├── features/           # Feature-based modules
│   ├── terminal/       # Terminal functionality
│   │   ├── components/ # React components
│   │   ├── hooks/      # Custom React hooks
│   │   └── services/   # Terminal-specific services
│   └── auth/          # Authentication functionality
│       ├── components/ # Auth UI components
│       ├── hooks/      # Auth-related hooks
│       └── services/   # Authentication services
├── shared/            # Shared utilities and types
│   ├── types/         # TypeScript type definitions
│   ├── utils/         # Utility functions
│   └── components/    # Shared components
└── infrastructure/    # External service integrations
    ├── socket/        # Socket.io client implementation
    └── api/          # HTTP API client

server/
├── domain/           # Business logic and models
├── application/      # Use cases and services
├── infrastructure/   # External service implementations
└── presentation/     # API controllers and Socket.io handlers
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- SSH server access (for testing connections)
- Modern web browser with WebSocket support

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/po3nx/sshterm.git
   cd sshterm
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your SSH server details:
   ```env
   # Required: SSH server configuration
   SSH_HOST=your.ssh.server.com
   SSH_PORT=22
   
   # Optional: Server configuration
   PORT=3000
   CLIENT_URL=http://localhost:3000
   ```

4. **Start development servers**
   ```bash
   npm run dev
   ```

   This starts both the React development server (port 3000) and the backend server (port 3001) concurrently.

5. **Access the application**
   
   Open your browser and navigate to `http://localhost:3000`

## 📜 Available Scripts

### Development
- `npm run dev` - Start both client and server in development mode
- `npm run client:dev` - Start only the React development server
- `npm run server:dev` - Start only the backend server with hot reload

### Production
- `npm run build` - Build both client and server for production
- `npm run start` - Start the production server
- `npm run client:build` - Build only the React application
- `npm run server:build` - Build only the server application

### Code Quality
- `npm run lint` - Run ESLint on all TypeScript files
- `npm run lint:fix` - Run ESLint and automatically fix issues
- `npm run type-check` - Run TypeScript type checking

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| SSH_HOST | No | - | Default SSH host for prefill (user can override in the form) |
| SSH_PORT | No | 22 | Default SSH port for prefill (user can override in the form) |
| PORT | No | 3001 | Backend server port |
| HOST | No | 0.0.0.0 | Backend bind host (use 127.0.0.1 in production behind NGINX) |
| CLIENT_URL | No | http://localhost:3000 | Frontend origins for CORS, comma-separated for multiple (e.g. https://app.example.com,https://staging.example.com) |
| NODE_ENV | No | development | Environment mode |

Client build-time (Vite) env:
- VITE_SERVER_URL (optional): Backend URL for Socket.IO/API when frontend and backend are on different origins. Example: https://app.example.com
- VITE_FORCE_POLLING (optional): Set to 1 to force polling transport in dev for diagnosing WS issues.

Server endpoints:
- GET /api/config returns defaultSSHHost and defaultSSHPort to prefill the login form.

### SSH Server Requirements

Your SSH server should support:
- SSH2 protocol
- Standard authentication methods (password-based)
- Shell access for the connecting user

## 🎨 Customization

### Terminal Themes

The terminal appearance can be customized by modifying the theme configuration in `src/features/terminal/hooks/useSSHTerminal.ts`:

```typescript
const terminal = new Terminal({
  cursorBlink: true,
  theme: {
    background: '#1a1a1a',    // Background color
    foreground: '#ffffff',    // Text color
    cursor: '#ffffff',        // Cursor color
    selection: '#ffffff33'    // Selection color
  },
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: 14,
  lineHeight: 1.2
});
```

### UI Components

All UI components use CSS modules and can be customized by editing the corresponding `.css` files in the component directories.

## 🔒 Security Considerations

- Authentication: The application requires valid SSH credentials
- Transport Security: Use HTTPS in production for secure credential transmission
- Session Management: Sessions are automatically cleaned up after inactivity
- CORS: Properly configured CORS policies; server supports comma-separated CLIENT_URL
- Content Security Policy: Helmet enforces script-src 'self'. index.html avoids inline scripts; X-Frame-Options is set via headers, not meta
- Input Validation: User inputs are validated on both client and server
- No Credential Storage: SSH credentials are not stored on the server

## 🚀 Production Deployment (NGINX + Node)

Recommended: same-origin deployment behind NGINX

1. Server .env
```
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
CLIENT_URL=http://localhost:3000
# Optional defaults to prefill the form
SSH_HOST=your-ssh-host.example.com
SSH_PORT=22
```

2. Build and start
```
npm ci
npm run build
NODE_ENV=production HOST=127.0.0.1 PORT=3001 npm start
```

3. NGINX (essential WS upgrade headers)
```
server {
  listen 443 ssl http2;
  server_name your.domain.com

  # ssl_certificate / ssl_certificate_key ...

  proxy_read_timeout 600s;
  proxy_send_timeout 600s;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Split-origin option
- If frontend is served from a different origin, build with: `VITE_SERVER_URL=http://lcoalhost:3000`
- Set `CLIENT_URL` on the server to your frontend origin(s)

## 🐳 Docker Support

Create a `Dockerfile` for easy deployment:

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t ssh-terminal .
docker run -p 3000:3000 -e SSH_HOST=your-server.com ssh-terminal
```

## 🧪 Testing

The application includes TypeScript type checking and ESLint for code quality. To run tests:

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## 📈 Performance Optimizations

- **Code Splitting**: Automatic code splitting with Vite
- **Tree Shaking**: Dead code elimination in production builds
- **Compression**: Gzip compression for static assets
- **Caching**: Proper caching headers for static resources
- **Bundle Analysis**: Use `npm run client:build` and analyze bundle size

## 🔍 Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check SSH server is running and accessible
   - Verify SSH_HOST and SSH_PORT in `.env`
   - Ensure firewall allows connections on SSH port

2. **Authentication Failed**
   - Verify username/password credentials
   - Check SSH server allows password authentication
   - Review SSH server logs for details

3. **WebSocket Connection Issues**
   - Prefer same-origin in production (no localhost); use NGINX to proxy to Node
   - If split origins, set VITE_SERVER_URL to your backend public URL
   - In dev, use Vite proxy (default) or set VITE_SERVER_URL=http://127.0.0.1:3000
   - If handshake fails, try VITE_FORCE_POLLING=1 to diagnose WS upgrade issues
   - Ensure CLIENT_URL includes your frontend origin(s) and NGINX forwards Upgrade/Connection headers

4. **Terminal Display Issues**
   - Clear browser cache and cookies
   - Check if XTerm.js CSS is loading properly
   - Verify terminal dimensions are being set correctly

### Debug Mode

Enable debug logging by setting environment variables:
```bash
DEBUG=ssh-terminal:* npm run dev
```

## 📋 TODO / Roadmap

- [ ] Support for SSH key-based authentication
- [ ] Multiple simultaneous SSH connections
- [ ] File transfer capabilities (SCP/SFTP)
- [ ] Session recording and playback
- [ ] Terminal sharing and collaboration
- [ ] Custom keybinding configuration
- [ ] Plugin architecture for extensibility
- [ ] Performance monitoring and metrics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code follows the project's coding standards and includes appropriate tests.

## 📄 License

This project is licensed under the ISC License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [XTerm.js](https://xtermjs.org/) - Terminal emulation in the browser
- [Socket.io](https://socket.io/) - Real-time bidirectional communication
- [SSH2](https://github.com/mscdex/ssh2) - SSH2 client for Node.js
- [React](https://reactjs.org/) - UI framework
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Vite](https://vitejs.dev/) - Fast development build tool

## 📞 Support

If you encounter any issues or have questions:

1. Check the [troubleshooting section](#-troubleshooting)
2. Search existing issues in the repository
3. Create a new issue with detailed information about your problem

---

**Happy terminal-ing!** 🚀
