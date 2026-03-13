# GIS File Viewer & Editor Implementation Plan (CesiumJS Edition)

## 1. Project Overview
This project aims to build a web-based GIS application using **Angular** (frontend) and **Spring Boot** (backend) capable of uploading, viewing, and editing various geospatial file formats (.kml, .kmz, .shp, .gpx, .gdb, .sqlite, .mdb). The system will use **CesiumJS** for high-performance 3D/2D map visualization and **PostGIS** for data management.

## 2. Technology Stack

### Frontend (Client-Side)
*   **Framework:** Angular (latest stable version).
*   **Mapping Engine:** **CesiumJS**. An open-source JavaScript library for world-class 3D globes and maps.
*   **UI Component Library:** Angular Material or PrimeNG (for layer management panels, upload dialogs).
*   **HTTP Client:** Angular `HttpClient`.

### Backend (Server-Side)
*   **Framework:** Spring Boot (Java).
*   **GIS Processing:** **GeoTools** (Java) + **GDAL** (Command Line/Bindings).
*   **Database:** **PostgreSQL** with **PostGIS** extension.

### Infrastructure
*   **ArcGIS Enterprise Server:** (Optional) Can still be used to provide high-quality Satellite/Street basemaps to Cesium via `ArcGisMapServerImageryProvider`.

## 3. Database Design (PostgreSQL + PostGIS)

**1. Table: `uploaded_layers`**
Stores metadata about the original file.
*   `id` (UUID): Primary Key.
*   `layer_name` (String): Display name.
*   `format` (String): Original format (SHP, KML).
*   `visible` (Boolean): Default visibility.
*   `style_config` (JSONB): Stores color, width, opacity.

**2. Table: `layer_features`**
Stores the actual geospatial data.
*   `id` (BigInt): Primary Key.
*   `layer_id` (UUID): FK to `uploaded_layers`.
*   `geom` (Geometry, 4326): PostGIS geometry column.
*   `properties` (JSONB): Dynamic attributes (Name, Description, Pop, Elev).

## 4. Architecture & Data Flow

1.  **Upload:** User uploads file via Angular.
2.  **Conversion (Backend):**
    *   **Spring Boot** detects format.
    *   **KMZ/KML:** Cesium has native KML support (`KmlDataSource`), but for *editing*, it is better to convert to **FeatureCollection (GeoJSON)** so we have a unified editing logic.
    *   **SHP/GDB/MDB/GPX:** Convert spatial data to **GeoJSON** using GeoTools/GDAL.
3.  **Storage:** Save metadata to `uploaded_layers` and features to `layer_features`.
4.  **Display (Frontend):**
    *   Angular fetches GeoJSON.
    *   Cesium loads it into a `GeoJsonDataSource`.
    *   Entities (Points, Polygons, Polylines) are clamped to ground.
5.  **Layer Management:** Use `viewer.dataSources` to toggle visibility, fly to extent, or remove layers.
6.  **Edit (Frontend - Custom Implementation):**
    *   Cesium does not have a built-in "Editor Widget".
    *   We must implement `ScreenSpaceEventHandler` to detect clicks (picking entities).
    *   Implement "Drag and Drop" logic to update entity positions.
7.  **Update/Save:**
    *   Send modified GeoJSON back to Spring Boot.
    *   Update `layer_features` in PostGIS.
    *   (Optional) Export back to original format.

## 5. Detailed Strategy per File Format

| Format | Read Strategy (Backend) | Frontend Visualization | Notes |
| :--- | :--- | :--- | :--- |
| **.kml / .kmz** | Parse to GeoJSON usually favored for editing | `GeoJsonDataSource` (or `KmlDataSource` for read-only) | KMZ is zipped. Unzip, parse KML. |
| **.shp (Shapefile)** | GeoTools `ShapefileDataStore` -> GeoJSON | `GeoJsonDataSource` | Upload as .zip. |
| **.gpx** | Parse XML/GeoTools -> GeoJSON | `GeoJsonDataSource` | Often contains routes/tracks. |
| **.gdb / .mdb** | GDAL (`ogr2ogr`) -> GeoJSON | `GeoJsonDataSource` | Complex formats. |
| **.sqlite** | GeoTools JDBC -> GeoJSON | `GeoJsonDataSource` | |

## 6. Implementation Roadmap

### Phase 1: Backend Setup (Spring Boot + PostGIS)
1.  **Project Init:** Spring Boot Web, JPA, PostGIS JDBC driver.
2.  **GDAL/GeoTools Integration:** Configure access to `ogr2ogr` and `gt-shapefile`.
3.  **API Endpoints:**
    *   `POST /layers/upload`: Consumes file, saves to DB, returns Layer ID.
    *   `GET /layers/{id}/geojson`: Returns the feature collection for a layer.
    *   `PUT /layers/{id}/features`: Updates geometry/properties for features.

### Phase 2: Frontend Setup (Angular + Cesium)
1.  **Install Cesium:**
    ```bash
    npm install cesium
    ```
2.  **Configure Assets:** Update `angular.json` to include Cesium assets (Workers, Styles) in the build output.
3.  **Viewer Component:**
    *   Initialize `viewer = new Cesium.Viewer('cesiumContainer')`.
    *   Strip default widgets (Timeline, Animation) if not needed for GIS.
    *   Add BaseLayerPicker (ArcGIS, OpenStreetMaps).

### Phase 3: Core Features (View & Layer Control)
1.  **Layer Manager Service:**
    *   Manages array of active layers.
    *   Functions: `addLayer(geojson)`, `toggleVisibility(id)`, `removeLayer(id)`.
2.  **Loading Data:**
    ```typescript
    Cesium.GeoJsonDataSource.load(data, {
      clampToGround: true
    }).then(dataSource => {
      viewer.dataSources.add(dataSource);
      viewer.flyTo(dataSource);
    });
    ```
3.  **Layer List UI:**
    *   Sidebar with checkboxes bound to `dataSource.show`.

### Phase 4: Editing (The Hard Part)
Since Cesium lacks a native editor, we build a **"Gizmo" or "Interaction" system**.
1.  **Picking:** Use `viewer.scene.pick(position)` on mouse click.
2.  **Draggable Points:**
    *   On `LEFT_DOWN`: Check if an Entity is picked. Disable camera inputs (`scene.screenSpaceCameraController.enableRotate = false`).
    *   On `MOUSE_MOVE`: Convert screen coordinates to cartesian (`viewer.camera.pickEllipsoid`). Update Entity position.
    *   On `LEFT_UP`: Re-enable camera. Save new coordinates to temporary state.
3.  **Attribute Editing:**
    *   On click, open Angular Dialog/Sidebar showing `entity.properties`.
    *   User edits values -> Update `entity.properties`.

### Phase 5: Saving & Updating
1.  **Save Button:**
    *   Iterate `dataSource.entities.values`.
    *   Construct GeoJSON FeatureCollection.
    *   `http.put('/layers/' + id, geoJson)` to Backend.

## 7. Code Snippets

### Frontend: Cesium Initialization (Angular)
```typescript
import { Component, OnInit, ElementRef } from '@angular/core';
import * as Cesium from 'cesium';

@Component({ ... })
export class MapComponent implements OnInit {
  viewer: Cesium.Viewer;

  constructor(private el: ElementRef) {}

  ngOnInit() {
    this.viewer = new Cesium.Viewer(this.el.nativeElement, {
      terrainProvider: Cesium.createWorldTerrain(),
      animation: false,
      timeline: false
    });
    
    // Add ArcGIS Basemap
    const arcgisProvider = new Cesium.ArcGisMapServerImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
    });
    this.viewer.imageryLayers.addImageryProvider(arcgisProvider);
  }
}
```

### Frontend: Loading & Clamping GeoJSON
```typescript
addGeoJsonLayer(geoJsonData: any) {
    const promise = Cesium.GeoJsonDataSource.load(geoJsonData, {
        clampToGround: true, // Important for vector data on terrain
        stroke: Cesium.Color.HOTPINK,
        fill: Cesium.Color.PINK.withAlpha(0.5),
        strokeWidth: 3
    });

    promise.then((dataSource) => {
        this.viewer.dataSources.add(dataSource);
        this.viewer.flyTo(dataSource);
    });
}
```

### Backend: GeoTools Shapefile -> GeoJSON (Stays similar)
See previous backend snippets. Key difference is using PostGIS to store this immediately after conversion.

## 8. Advanced Implementation Details

### A. 2D vs 3D Editing Complexity
*   **Challenge:** Editing polygons on a 3D globe is math-heavy. A straight line in 2D is a generic curve on a sphere.
*   **Workaround:** For simple edits, force standard "Cartographic" (Lat/Lon) updates. If high-precision editing is needed, ensure valid reprojection to WGS84.

### B. Layer-Wise styling
*   Cesium's `GeoJsonDataSource` applies one style to the whole file by default.
*   **Feature Styling:** To color specific features based on attributes (e.g., "Type=Forest" -> Green), you must iterate `dataSource.entities.values` after loading and set `entity.polygon.material = ...` individually.

### C. Large Datasets (3D Tiles)
*   **Future Upgrade:** If users upload massive datasets (>100MB), GeoJSON will freeze the browser. You should eventually integrate a "3D Tiles Pipeline" on the backend to stream data efficiently.

## 9. Final Summary Checklist
1.  [ ] **Postgres** running with `postgis`.
2.  [ ] **Backend** converts all formats to GeoJSON.
3.  [ ] **CesiumJS** displays layers correctly on terrain.
4.  [ ] **Editing** logic (Pick -> Move -> Save) is functional.
