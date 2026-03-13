// import { Component, OnInit, OnDestroy } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule } from '@angular/forms';
// import { LayerService } from '../../services/layer';

// declare const window: any;

// @Component({
//   selector: 'app-cesium',
//   standalone: true,
//   imports: [CommonModule, FormsModule],
//   template: `
//     <div class="cesium-shell">
//       <div id="cesiumContainer"></div>

//       <div class="cesium-controls">
//         <button (click)="home()">Home</button>
//         <button (click)="toggleTerrain()">{{ terrainEnabled ? 'Disable' : 'Enable' }} Terrain</button>
//         <button (click)="toggleDebug()">{{ debug ? 'Hide' : 'Show' }} Debug</button>
//         <div *ngIf="debug" style="margin-top:6px;display:flex;gap:6px;align-items:center;">
//           <input [(ngModel)]="testUrl" placeholder="Paste public GeoJSON/KML/3DTiles URL" class="cesium-input" />
//           <button (click)="loadTest()">Load</button>
//         </div>
//       </div>

//       <div class="cesium-layer-list" *ngIf="debug">
//         <div class="title">Loaded Layers</div>
//         <div *ngFor="let item of loaded; let i = index">{{ i+1 }}. {{ item.name || item.url || item.type || 'layer' }}</div>
//         <div class="last">Last: {{ lastUrl }}</div>
//       </div>

//       <div class="cesium-attribution" *ngIf="attributionText">{{ attributionText }}</div>
//       <div class="cesium-error" *ngIf="errorMessage">{{ errorMessage }}</div>
//     </div>
//   `,
//   styles: [
//     `:host { display:block; height:100%; width:100%; }
//     .cesium-shell { position:relative; height:100%; width:100%; }
//     #cesiumContainer { position:absolute; inset:0; }
//     .cesium-controls {
//       position:absolute; right:12px; top:12px; z-index:50; display:flex; flex-direction:column; gap:6px;
//       background: rgba(6,24,40,0.75); padding:8px; border-radius:6px; color: #fff;
//     }
//     .cesium-controls button { background:transparent; border:1px solid rgba(255,255,255,0.08); color:#fff; padding:6px 8px; border-radius:4px; cursor:pointer; }
//     .cesium-input { width:220px; padding:6px; border-radius:4px; border:1px solid rgba(255,255,255,0.06); background:transparent; color:#fff }
//     .cesium-layer-list { position:absolute; left:12px; top:12px; z-index:50; background: rgba(6,24,40,0.75); padding:8px; border-radius:6px; color:#fff; max-width:320px; }
//     .cesium-layer-list .title { font-weight:700; margin-bottom:6px; }
//     .cesium-layer-list .last { margin-top:6px; font-size:0.85rem; opacity:0.9 }
//     .cesium-attribution { position:absolute; left:12px; bottom:12px; z-index:60; background: rgba(0,0,0,0.55); color:#fff; padding:6px 8px; border-radius:4px; font-size:0.85rem }
//     .cesium-error { position:absolute; left:50%; transform:translateX(-50%); top:12px; z-index:80; background: rgba(200,40,40,0.95); color:#fff; padding:8px 12px; border-radius:6px; font-weight:600 }`
//   ]
// })
// export class CesiumMapComponent implements OnInit, OnDestroy {
//   private viewer: any;
//   terrainEnabled = false;
//   debug = false;
//   loaded: Array<any> = [];
//   lastUrl = '';
//   testUrl = '';
//   attributionText = '';
//   errorMessage = '';

//   constructor(private layerService: LayerService) {}

//   ngOnInit(): void {
//     this.loadCesium().then(() => {
//       const Cesium = (window as any).Cesium;
//       try {
//         this.viewer = new Cesium.Viewer('cesiumContainer', {
//           baseLayerPicker: false,
//           imageryProvider: new Cesium.OpenStreetMapImageryProvider({ url: 'https://a.tile.openstreetmap.org/' }),
//           terrainProvider: new Cesium.EllipsoidTerrainProvider(),
//           animation: false,
//           timeline: false
//         });

//         // subscribe to uploaded layers
//         try {
//           this.layerService.layerAdded$.subscribe((ref: any) => {
//             this.clearError();
//             let urlOrId: any = ref;
//             if (ref && typeof ref === 'object') {
//               urlOrId = ref.url || ref.id || ref.layerUrl || JSON.stringify(ref);
//             }
//             this.lastUrl = urlOrId;

//             const looksLikeUrl = typeof urlOrId === 'string' && /^(https?:)?\/\//.test(urlOrId);
//             if (looksLikeUrl) {
//               this.addDataSourceFromUrl(urlOrId).catch(err => this.showError('Failed to load layer: ' + this.formatError(err)));
//             } else {
//               // treat as ID or backend ref — call LayerService.getGeoJson
//               try {
//                 this.layerService.getGeoJson(urlOrId).subscribe({
//                   next: (geo: any) => {
//                     try {
//                       const blob = new (window as any).Blob([JSON.stringify(geo)], { type: 'application/geo+json' });
//                       const tmpUrl = (window as any).URL.createObjectURL(blob);
//                       this.addDataSourceFromUrl(tmpUrl).catch(err => this.showError('Failed to add fetched GeoJSON: ' + this.formatError(err)));
//                     } catch (e) { this.showError('Invalid GeoJSON from backend'); }
//                   },
//                   error: (err: any) => this.showError('Failed to fetch converted GeoJSON from server: ' + this.formatError(err))
//                 });
//               } catch (e) {
//                 this.showError('LayerService does not support getGeoJson for this ref');
//               }
//             }
//           });
//         } catch (e) { (window as any).console && (window as any).console.warn && (window as any).console.warn('LayerService subscribe failed for Cesium', e); }

//       } catch (err) {
//         this.showError('Failed to create Cesium viewer: ' + this.formatError(err));
//         (window as any).console && (window as any).console.error && (window as any).console.error('Failed to create Cesium viewer', err);
//       }
//     }).catch(err => {
//       this.showError('Failed to load Cesium script: ' + this.formatError(err));
//       (window as any).console && (window as any).console.error && (window as any).console.error('Failed to load Cesium script', err);
//     });
//   }

//   ngOnDestroy(): void {
//     try { this.viewer && this.viewer.destroy && this.viewer.destroy(); } catch (e) { /* ignore */ }
//   }

//   async addDataSourceFromUrl(url: string): Promise<void> {
//     const Cesium = (window as any).Cesium;
//     if (!Cesium || !this.viewer) throw new Error('Cesium not ready');

//     // try GeoJSON
//     try {
//       const ds = await Cesium.GeoJsonDataSource.load(url, { clampToGround: true });
//       this.viewer.dataSources.add(ds);
//       this.loaded.push({ type: 'geojson', ds, url, name: ds.name });
//       this.updateAttributionFromDataSource(ds);
//       return;
//     } catch (e) {
//       // not geojson
//     }

//     // try KML
//     try {
//       const kds = await Cesium.KmlDataSource.load(url);
//       this.viewer.dataSources.add(kds);
//       this.loaded.push({ type: 'kml', ds: kds, url, name: kds.name });
//       this.updateAttributionFromDataSource(kds);
//       return;
//     } catch (e) {
//       // not kml
//     }

//     // try 3DTiles
//     try {
//       const tileset = new Cesium.Cesium3DTileset({ url });
//       this.viewer.scene.primitives.add(tileset);
//       this.loaded.push({ type: '3dtiles', tileset, url, name: tileset.url });
//       this.updateAttributionFromTileset(tileset);
//       return;
//     } catch (e) {
//       // fallback
//     }

//     throw new Error('Unsupported layer type or failed to load: ' + url);
//   }

//   home() { try { this.viewer && this.viewer.camera && this.viewer.camera.flyHome(); } catch (e) { /* ignore */ } }

//   toggleTerrain() {
//     const Cesium = (window as any).Cesium;
//     if (!Cesium || !this.viewer) return;
//     if (this.terrainEnabled) {
//       this.viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
//       this.terrainEnabled = false;
//       this.attributionText = '';
//     } else {
//       try {
//         // createWorldTerrain may require a token in some setups; wrap safely
//         if (Cesium.createWorldTerrain) {
//           this.viewer.terrainProvider = Cesium.createWorldTerrain();
//           this.terrainEnabled = true;
//           this.attributionText = 'Terrain: Cesium World Terrain (may require token)';
//         } else {
//           this.showError('Cesium World Terrain is not available in this build');
//         }
//       } catch (e) {
//         this.showError('Failed to enable world terrain; using ellipsoid. ' + this.formatError(e));
//         try { this.viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider(); } catch(_){}
//         this.terrainEnabled = false;
//       }
//     }
//   }

//   toggleDebug() { this.debug = !this.debug; }

//   loadTest() {
//     if (!this.testUrl) return this.showError('Enter a URL to load');
//     this.addDataSourceFromUrl(this.testUrl).catch(err => this.showError('Test load failed: ' + this.formatError(err)));
//   }

//   private updateAttributionFromDataSource(ds: any) {
//     try {
//       const credits = ds.attribution || ds.source && ds.source.attribution || ds.credit;
//       this.attributionText = credits || 'Data loaded';
//     } catch (e) { this.attributionText = 'Data loaded'; }
//   }

//   private updateAttributionFromTileset(tileset: any) {
//     try {
//       const meta = tileset.metadata || tileset.properties || tileset._urlMetadata;
//       this.attributionText = meta?.attribution || tileset.url || '3D Tiles loaded';
//     } catch (e) { this.attributionText = '3D Tiles loaded'; }
//   }

//   private showError(msg: string) {
//     (window as any).console && (window as any).console.error && (window as any).console.error(msg);
//     this.errorMessage = typeof msg === 'string' ? msg : JSON.stringify(msg);
//     (window as any).setTimeout(() => { this.errorMessage = ''; }, 6000);
//   }

//   private clearError() { this.errorMessage = ''; }

//   private formatError(err: any): string {
//     try {
//       if (!err) return '' + err;
//       if (typeof err === 'string') return err;
//       if ((err as any).message) return (err as any).message;
//       return String(err);
//     } catch (_) { return String(err); }
//   }

//   private loadCesium(): Promise<void> {
//     return new Promise((resolve, reject) => {
//       if ((window as any).Cesium) return resolve();
//       const existing = (window as any).document.getElementById('cesium-script');
//       if (existing) {
//         existing.addEventListener('load', () => resolve());
//         existing.addEventListener('error', (e: any) => reject(e));
//         return;
//       }

//       const script = (window as any).document.createElement('script');
//       script.id = 'cesium-script';
//       script.src = '/assets/cesium/Cesium.js';
//       script.onload = () => resolve();
//       script.onerror = (e: any) => reject(e);
//       (window as any).document.body.appendChild(script);
//     });
//   }
// }

import { Component, ElementRef, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as Cesium from 'cesium';

// Ensure Cesium generic assets are loaded. 
// Usually setup in angular.json, but this tells Cesium where base URL is if needed
(window as any).CESIUM_BASE_URL = '/assets/cesium/';

@Component({
  selector: 'app-cesium-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-container" #mapContainer></div>

    <div class="building-popup" *ngIf="popupVisible" [style.left.px]="popupX" [style.top.px]="popupY">
      <div class="popup-title">Building Information</div>
      <div class="popup-row">ID : {{ selectedBuildingId }}</div>
      <button class="popup-btn" (click)="startEditSelectedBuilding()">Edit Building</button>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100vh; }
    .map-container { width: 100%; height: 100%; }
    .building-popup {
      position: absolute;
      z-index: 20;
      min-width: 210px;
      background: rgba(10, 18, 30, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #fff;
      padding: 10px;
      border-radius: 8px;
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
      transform: translate(-50%, -110%);
    }
    .popup-title {
      font-weight: 700;
      margin-bottom: 8px;
    }
    .popup-row {
      margin-bottom: 10px;
      font-size: 13px;
      opacity: 0.95;
    }
    .popup-btn {
      width: 100%;
      padding: 7px 8px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.26);
      background: #2f5df5;
      color: #fff;
      cursor: pointer;
      font-weight: 600;
    }
  `]
})
export class CesiumMapComponent implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
  
  private viewer!: Cesium.Viewer;
  private clickHandler?: Cesium.ScreenSpaceEventHandler;
  private dragHandler?: Cesium.ScreenSpaceEventHandler;
  private highlightedEntity?: Cesium.Entity;
  private selectedEntity?: Cesium.Entity;
  private selectedPositions: Cesium.Cartesian3[] = [];
  private activeVertexIndex: number | null = null;
  private originalMaterials = new Map<string, Cesium.MaterialProperty>();
  private vertexEntities: Cesium.Entity[] = [];

  popupVisible = false;
  popupX = 0;
  popupY = 0;
  selectedBuildingId = 'BLD001';

  ngOnInit(): void {
    this.initCesium();
    this.setupBuildingInteraction();
  }

  ngOnDestroy(): void {
    this.clearVertexHandles();
    this.restoreHighlight();
    this.clickHandler?.destroy();
    this.dragHandler?.destroy();
    if (this.viewer) {
      this.viewer.destroy();
    }
  }

  private initCesium() {
    this.viewer = new Cesium.Viewer(this.mapContainer.nativeElement, {
      terrainProvider: undefined, // Standard ellipsoid for now
      baseLayerPicker: false,     // Hide default layer picker
      animation: false,           // Hide animation widget
      timeline: false,            // Hide timeline widget
      geocoder: false,            // Hide search
      homeButton: true,
      sceneModePicker: true,
      navigationHelpButton: false,
      infoBox: true,              // Show feature info on click
      selectionIndicator: true
    });

    // Add a default OSM layer (optional, Cesium usually has Bing/Ion default)
    this.viewer.imageryLayers.addImageryProvider(
      new Cesium.OpenStreetMapImageryProvider({
        url: 'https://a.tile.openstreetmap.org/'
      })
    );
     
    console.log("Cesium Viewer Initialized");
  }

  private setupBuildingInteraction() {
    this.clickHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    this.clickHandler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = this.viewer.scene.pick(click.position);

      if (!picked || !(picked as any).id) {
        this.popupVisible = false;
        this.selectedEntity = undefined;
        this.restoreHighlight();
        this.clearVertexHandles();
        return;
      }

      const entity = (picked as any).id as Cesium.Entity;
      if (!entity.polygon) {
        this.popupVisible = false;
        return;
      }

      this.selectedEntity = entity;
      this.highlightBuilding(entity);
      this.selectedBuildingId = this.extractBuildingId(entity);

      this.popupX = click.position.x;
      this.popupY = click.position.y;
      this.popupVisible = true;
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  private extractBuildingId(entity: Cesium.Entity): string {
    const p = entity.properties;
    const candidates = [
      p?.getValue(Cesium.JulianDate.now())?.id,
      p?.getValue(Cesium.JulianDate.now())?.ID,
      p?.getValue(Cesium.JulianDate.now())?.building_id,
      p?.getValue(Cesium.JulianDate.now())?.buildingId,
      p?.getValue(Cesium.JulianDate.now())?.OBJECTID,
      entity.id
    ];

    const found = candidates.find((v) => v !== undefined && v !== null && `${v}`.trim().length > 0);
    return found ? `${found}` : 'BLD001';
  }

  private highlightBuilding(entity: Cesium.Entity) {
    this.restoreHighlight();

    if (!entity.polygon) {
      return;
    }

    const key = entity.id;
    if (!this.originalMaterials.has(key) && entity.polygon.material) {
      this.originalMaterials.set(key, entity.polygon.material as Cesium.MaterialProperty);
    }

    entity.polygon.material = new Cesium.ColorMaterialProperty(Cesium.Color.YELLOW.withAlpha(0.55));
    entity.polygon.outline = new Cesium.ConstantProperty(true);
    entity.polygon.outlineColor = new Cesium.ConstantProperty(Cesium.Color.ORANGE);
    entity.polygon.outlineWidth = new Cesium.ConstantProperty(3);
    this.highlightedEntity = entity;
  }

  private restoreHighlight() {
    if (!this.highlightedEntity?.polygon) {
      this.highlightedEntity = undefined;
      return;
    }

    const key = this.highlightedEntity.id;
    const original = this.originalMaterials.get(key);
    if (original) {
      this.highlightedEntity.polygon.material = original;
    }
    this.highlightedEntity.polygon.outline = new Cesium.ConstantProperty(true);
    this.highlightedEntity.polygon.outlineColor = new Cesium.ConstantProperty(Cesium.Color.WHITE);
    this.highlightedEntity.polygon.outlineWidth = new Cesium.ConstantProperty(1);
    this.highlightedEntity = undefined;
  }

  startEditSelectedBuilding() {
    if (!this.selectedEntity?.polygon) {
      return;
    }

    const hierarchy = this.selectedEntity.polygon.hierarchy?.getValue(Cesium.JulianDate.now());
    const positions = hierarchy?.positions;
    if (!positions || positions.length < 3) {
      return;
    }

    this.popupVisible = false;
    this.selectedPositions = positions.map((p: Cesium.Cartesian3) => Cesium.Cartesian3.clone(p));
    this.selectedEntity.polygon.hierarchy = new Cesium.CallbackProperty(() => {
      return new Cesium.PolygonHierarchy(this.selectedPositions);
    }, false);

    this.createVertexHandles();
    this.enableVertexDrag();
  }

  private createVertexHandles() {
    this.clearVertexHandles();

    this.vertexEntities = this.selectedPositions.map((pos, index) => {
      return this.viewer.entities.add({
        id: `vertex-${this.selectedEntity?.id}-${index}`,
        position: new Cesium.CallbackPositionProperty(() => this.selectedPositions[index], false),
        point: {
          pixelSize: 11,
          color: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    });
  }

  private enableVertexDrag() {
    this.dragHandler?.destroy();
    this.dragHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    this.dragHandler.setInputAction((down: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = this.viewer.scene.pick(down.position);
      const pickedEntity = (picked as any)?.id as Cesium.Entity | undefined;
      if (!pickedEntity || typeof pickedEntity.id !== 'string' || !pickedEntity.id.startsWith('vertex-')) {
        this.activeVertexIndex = null;
        return;
      }

      const idx = Number(pickedEntity.id.split('-').pop());
      this.activeVertexIndex = Number.isFinite(idx) ? idx : null;
      this.viewer.scene.screenSpaceCameraController.enableRotate = false;
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    this.dragHandler.setInputAction((move: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      if (this.activeVertexIndex === null) {
        return;
      }

      const cartesian = this.pickGroundPosition(move.endPosition);
      if (!cartesian) {
        return;
      }

      this.selectedPositions[this.activeVertexIndex] = cartesian;
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    this.dragHandler.setInputAction(() => {
      this.activeVertexIndex = null;
      this.viewer.scene.screenSpaceCameraController.enableRotate = true;
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
  }

  private pickGroundPosition(screen: Cesium.Cartesian2): Cesium.Cartesian3 | null {
    const scene = this.viewer.scene;
    const ray = this.viewer.camera.getPickRay(screen);
    if (!ray) {
      return null;
    }

    const globePoint = scene.globe.pick(ray, scene);
    if (globePoint) {
      return globePoint;
    }

    return this.viewer.scene.pickPosition(screen) ?? null;
  }

  private clearVertexHandles() {
    if (!this.viewer) {
      this.vertexEntities = [];
      return;
    }

    for (const v of this.vertexEntities) {
      try {
        this.viewer.entities.remove(v);
      } catch {
        // no-op
      }
    }
    this.vertexEntities = [];
    this.activeVertexIndex = null;
    if (this.viewer?.scene?.screenSpaceCameraController) {
      this.viewer.scene.screenSpaceCameraController.enableRotate = true;
    }
  }

  /**
   * Public method called by parent components to load GeoJSON
   * @param geoJsonData The GeoJSON object fetched from backend
   */
  async addGeoJsonLayer(geoJsonData: any) {
    if (!this.viewer) {
        console.error("Cesium viewer not ready");
        return;
    }

    try {
      console.log("Loading GeoJSON into Cesium...", geoJsonData);

      // Load the data
      const dataSource = await Cesium.GeoJsonDataSource.load(geoJsonData, {
        stroke: Cesium.Color.HOTPINK,
        fill: Cesium.Color.PINK.withAlpha(0.5),
        strokeWidth: 3,
        clampToGround: true // Very important for 3D terrain
      });

      // Add to map
      await this.viewer.dataSources.add(dataSource);
      
      // Zoom to the data
      this.viewer.zoomTo(dataSource);
      
      console.log("Layer added and zoomed successfully.");

    } catch (error) {
      console.error("Error loading GeoJSON to Cesium:", error);
    }
  }
}
