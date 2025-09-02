# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.4] - 2025-09-02

### Added
- Auto-discover AL project directories containing app.json + .app files
- Version filtering to always use only the most recent version of each package
- Support for non-namespace AL packages (legacy format compatibility)
- Enhanced project directory search alongside existing .alpackages discovery

### Fixed
- AL package NAVX header extraction issues preventing ZIP extraction
- PowerShell extraction compatibility with .app files requiring .zip extension
- Cross-platform ZIP extraction support for Windows systems

### Changed
- Improved package discovery to find 13+ AL projects in typical repository structure
- Enhanced parser to handle both modern (namespace) and legacy (root-level) AL package formats
- Better error handling and logging for package loading failures

## [2.0.3] - 2024-XX-XX

### Fixed
- System-wide disk scanning prevention with VS Code settings support
- Cross-platform ZIP extraction support for Windows

## [2.0.2] - 2024-XX-XX

### Fixed
- OS-specific AL CLI packages for installation

### Added
- Improved installation process for different operating systems

---

## Legend
- **Added** - New features
- **Changed** - Changes in existing functionality  
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes

[Unreleased]: https://github.com/StefanMaron/AL-Dependency-MCP-Server/compare/v2.0.4...HEAD
[2.0.4]: https://github.com/StefanMaron/AL-Dependency-MCP-Server/compare/v2.0.3...v2.0.4
[2.0.3]: https://github.com/StefanMaron/AL-Dependency-MCP-Server/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/StefanMaron/AL-Dependency-MCP-Server/releases/tag/v2.0.2