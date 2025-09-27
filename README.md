# SSH Terminal - React TypeScript Edition

A modern, secure web-based SSH terminal application built with React TypeScript and Clean Architecture principles. This project provides a full-featured terminal interface for SSH connections through a web browser.

![SSH Terminal](https://img.shields.io/badge/SSH-Terminal-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.2+-blue)
![React](https://img.shields.io/badge/React-18.3+-blue)
![Clean Architecture](https://img.shields.io/badge/Architecture-Clean-green)

## ✨ Features

- **🔐 Secure SSH Connections**: Full SSH2 protocol support with authentication
- **🎨 Modern UI**: Clean, responsive React TypeScript interface
- **⚡ Real-time Terminal**: XTerm.js-powered terminal with full terminal features
- **🏗️ Clean Architecture**: Well-structured codebase following clean architecture principles
- **🔄 WebSocket Communication**: Real-time bidirectional communication via Socket.io
- **📱 Responsive Design**: Works on desktop, tablet, and mobile devices
- **♿ Accessibility**: WCAG compliant with full keyboard navigation
- **🎭 Multiple Themes**: Customizable terminal themes and appearance
- **🔧 TypeScript**: Full type safety throughout the application

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
   git clone <your-repo-url>
   cd ssh-react-ts
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
   PORT=3001
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
| `SSH_HOST` | ✅ | - | SSH server hostname or IP address |
| `SSH_PORT` | ❌ | `22` | SSH server port |
| `PORT` | ❌ | `3001` | Backend server port |
| `HOST` | ❌ | `0.0.0.0` | Backend server host |
| `CLIENT_URL` | ❌ | `http://localhost:3000` | Frontend URL for CORS |
| `NODE_ENV` | ❌ | `development` | Environment mode |

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

- **Authentication**: The application requires valid SSH credentials
- **Transport Security**: Use HTTPS in production for secure credential transmission
- **Session Management**: Sessions are automatically cleaned up after inactivity
- **CORS**: Properly configured CORS policies for cross-origin requests
- **Input Validation**: All user inputs are validated on both client and server
- **No Credential Storage**: SSH credentials are not stored on the server

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
docker run -p 3001:3001 -e SSH_HOST=your-server.com ssh-terminal
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
   - Check if client can reach server on port 3001
   - Verify CORS configuration in server
   - Check browser console for WebSocket errors

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
