# Feature Modules Documentation

This directory documents core and feature domain modules.

## Module Structure & Manifest Contract
All modules implement `App\Core\Modules\Contracts\ModuleManifestContract`:
- `slug()`: Unique snake_case module identifier.
- `name()`: Human-readable display name.
- `isCore()`: True for core baseline modules (`identity`, `organisation`); false for licensed feature modules.
- `permissions()`: Canonical permission strings (`module.resource.action`).
- `seeders()`: Optional map of tenant profile names (`baseline`, `kerala-polytechnic`) to seeder classes.
- `registerRoutes()`: API routes registered under `api/v1` with authentication and licensing gates.
