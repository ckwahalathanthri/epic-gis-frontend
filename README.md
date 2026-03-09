# 🌍 Epic GIS Frontend

<div align="center">

**Where Geography Meets Innovation**

[![Angular](https://img.shields.io/badge/Angular-21.0-DD0031?style=for-the-badge&logo=angular&logoColor=white)](https://angular.dev)
[![Cesium](https://img.shields.io/badge/Cesium-1.119-02599C?style=for-the-badge&logo=cesium&logoColor=white)](https://cesium.com)
[![ArcGIS](https://img.shields.io/badge/ArcGIS-4.34-2C7AC3?style=for-the-badge&logo=arcgis&logoColor=white)](https://developers.arcgis.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

*A powerful Geographic Information System platform built with cutting-edge web technologies*

[Features](#-features) • [Quick Start](#-quick-start) • [Architecture](#-architecture) • [Documentation](#-documentation) • [Contributing](#-contributing)

</div>

---

## 🎯 Overview

Epic GIS Frontend is a modern, feature-rich web application that brings sophisticated geographic visualization and analysis capabilities to your browser. Built on Angular 21 and powered by both Cesium and ArcGIS engines, this platform delivers a seamless experience for exploring, analyzing, and managing spatial data.

### ✨ Key Highlights

- 🗺️ **Dual Mapping Engines**: Leverage both Cesium's 3D globe and ArcGIS's powerful 2D/3D capabilities
- 🎨 **Modern UI/UX**: Clean, intuitive interface with responsive design
- ⚡ **Real-time Performance**: Fast rendering and smooth interactions even with large datasets
- 🛠️ **Rich Toolset**: Comprehensive GIS tools for measurement, analysis, and visualization
- 📊 **Data Management**: Built-in attribute tables and file management system
- 🎭 **Customizable**: Modular architecture allows easy extension and customization

---

## 🚀 Features

### 🌐 Map Visualization
- **3D Globe Rendering** with Cesium engine
- **Multi-layer Support** for diverse data sources
- **Dynamic Styling** and symbology
- **Smooth Navigation** and camera controls

### 🔧 GIS Tools
- 📏 Measurement tools (distance, area, height)
- 🎯 Spatial selection and query
- 📍 Geocoding and location search
- 🗺️ Layer management and styling
- 📊 Attribute table viewer

### 🎨 User Interface
- 🧭 Interactive navigation bar
- 📁 Sidebar with layer controls
- 🔍 Tools panel for quick access
- 📈 Status bar with coordinate display
- 🪟 Modal dialogs for data interaction

### 🔌 Integration Ready
- RESTful API integration
- Error handling and interceptors
- Environment-based configuration
- Extensible service architecture

---

## 🏃 Quick Start

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** (v10.9.2 or higher)
- **Angular CLI** (v21.0.4)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd epic-gis-frontend-main
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   # Copy and edit environment configuration
   cp src/environments/environments.ts src/environments/environments.local.ts
   ```

4. **Launch the application**
   ```bash
   npm start
   ```

5. **Open in browser**
   
   Navigate to `http://localhost:4200/` 🎉

   The app will automatically reload when you make changes to the source files.

---

## 🏗️ Architecture

### Project Structure

```
epic-gis-frontend/
├── 📁 src/
│   ├── 📁 app/
│   │   ├── 📁 components/      # Reusable UI components
│   │   │   ├── map/            # Main map component
│   │   │   ├── navbar/         # Top navigation
│   │   │   ├── sidebar/        # Layer control panel
│   │   │   ├── tools-panel/    # GIS tools interface
│   │   │   ├── statusbar/      # Information display
│   │   │   └── attributes-table/ # Data grid viewer
│   │   ├── 📁 gis/             # GIS engine integrations
│   │   │   ├── cesium-map/     # Cesium 3D implementation
│   │   │   └── map/            # Map service wrapper
│   │   ├── 📁 pages/           # Application pages
│   │   │   ├── dashboard/      # Main dashboard
│   │   │   └── files/          # File management
│   │   ├── 📁 services/        # Business logic & API
│   │   └── 📁 core/            # Core functionality
│   ├── 📁 environments/        # Environment configs
│   └── 📁 assets/              # Static resources
└── 📁 public/                  # Public assets (Cesium)
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Angular 21 | Application framework |
| **Language** | TypeScript 5.9 | Type-safe development |
| **3D Engine** | Cesium 1.119 | 3D globe & visualization |
| **GIS Engine** | ArcGIS 4.34 | Advanced GIS capabilities |
| **State Management** | RxJS 7.8 | Reactive programming |
| **Testing** | Vitest 4.0 | Unit & integration tests |
| **Build Tool** | Angular CLI | Build & development |

---

## 🛠️ Development

### Development Server

Start the local development server:

```bash
npm start
# or
ng serve
```

For custom host/port:
```bash
ng serve --host 0.0.0.0 --port 4300
```

### Code Generation

Generate new components, services, and more:

```bash
# Generate a component
ng generate component components/my-component

# Generate a service
ng generate service services/my-service

# Generate a module
ng generate module features/my-feature

# See all options
ng generate --help
```

### Building

Build for production:

```bash
npm run build
# or
ng build
```

Build artifacts will be stored in the `dist/` directory, optimized for production deployment.

For development builds with watch mode:
```bash
npm run watch
```

### Testing

Run unit tests with Vitest:

```bash
npm test
# or
ng test
```

Run tests with coverage:
```bash
ng test --coverage
```

---

## 🎨 Customization

### Styling

The project uses CSS with component-scoped styles. Global styles are in [src/styles.css](src/styles.css).

### Configuration

Environment-specific settings are managed in [src/environments/](src/environments/):
- `environments.ts` - Base configuration
- Create environment-specific files as needed

### Adding New Map Tools

1. Create a tool component in `src/app/components/tools-panel/`
2. Register it in the tools panel
3. Implement tool logic using map services
4. Add UI controls and event handlers

---

## 📚 Documentation

### API Reference

Explore the services:
- **LayerService** ([src/app/services/layer.ts](src/app/services/layer.ts)) - Layer management
- **ModalService** ([src/app/services/modal.service.ts](src/app/services/modal.service.ts)) - Modal dialogs
- **CesiumMap** ([src/app/gis/cesium-map/cesium-map.ts](src/app/gis/cesium-map/cesium-map.ts)) - Cesium integration

### External Documentation

- [Angular Documentation](https://angular.dev)
- [Cesium Documentation](https://cesium.com/docs)
- [ArcGIS API for JavaScript](https://developers.arcgis.com/javascript)

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Coding Standards

- Follow Angular style guide
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed
- Use Prettier for code formatting (configured in package.json)

---

## 🐛 Troubleshooting

### Common Issues

**Issue**: Cesium assets not loading
```bash
# Ensure Cesium assets are in public/assets/cesium/
# Check browser console for 404 errors
```

**Issue**: Build errors with dependencies
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Issue**: Angular CLI version mismatch
```bash
# Update Angular CLI globally
npm install -g @angular/cli@21.0.4
```

---

## 📋 Roadmap

- [ ] Advanced 3D analysis tools
- [ ] Real-time collaboration features
- [ ] Offline mode support
- [ ] Mobile app version
- [ ] Integration with more data sources
- [ ] Advanced terrain analysis
- [ ] Custom plugin system

---

## 📜 License

This project is private and proprietary. All rights reserved.

---

## 🌟 Acknowledgments

- **Angular Team** - For the amazing framework
- **Cesium** - For the incredible 3D globe
- **Esri** - For ArcGIS API
- **Open Source Community** - For the tools and libraries

---

<div align="center">

**Built with ❤️ using Angular & GIS Technologies**

*Making the world more accessible, one map at a time*

[⬆ Back to Top](#-epic-gis-frontend)

</div>
