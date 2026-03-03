import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LayerService } from '../../services/layer';

declare const window: any;

@Component({
  selector: 'app-cesium',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="cesium-shell">
      <div id="cesiumContainer"></div>

      <div class="cesium-controls">
        <button (click)="home()">Home</button>
        <button (click)="toggleTerrain()">{{ terrainEnabled ? 'Disable' : 'Enable' }} Terrain</button>
        <button (click)="toggleDebug()">{{ debug ? 'Hide' : 'Show' }} Debug</button>
        <div *ngIf="debug" style="margin-top:6px;display:flex;gap:6px;align-items:center;">
          <input [(ngModel)]="testUrl" placeholder="Paste public GeoJSON/KML/3DTiles URL" class="cesium-input" />
          <button (click)="loadTest()">Load</button>
        </div>
      </div>

      <div class="cesium-layer-list" *ngIf="debug">
        <div class="title">Loaded Layers</div>
        <div *ngFor="let item of loaded; let i = index">{{ i+1 }}. {{ item.name || item.url || item.type || 'layer' }}</div>
        <div class="last">Last: {{ lastUrl }}</div>
      </div>

      <div class="cesium-attribution" *ngIf="attributionText">{{ attributionText }}</div>
      <div class="cesium-error" *ngIf="errorMessage">{{ errorMessage }}</div>
    </div>
  `,
  styles: [
    `:host { display:block; height:100%; width:100%; }
    .cesium-shell { position:relative; height:100%; width:100%; }
    #cesiumContainer { position:absolute; inset:0; }
    .cesium-controls {
      position:absolute; right:12px; top:12px; z-index:50; display:flex; flex-direction:column; gap:6px;
      background: rgba(6,24,40,0.75); padding:8px; border-radius:6px; color: #fff;
    }
    .cesium-controls button { background:transparent; border:1px solid rgba(255,255,255,0.08); color:#fff; padding:6px 8px; border-radius:4px; cursor:pointer; }
    .cesium-input { width:220px; padding:6px; border-radius:4px; border:1px solid rgba(255,255,255,0.06); background:transparent; color:#fff }
    .cesium-layer-list { position:absolute; left:12px; top:12px; z-index:50; background: rgba(6,24,40,0.75); padding:8px; border-radius:6px; color:#fff; max-width:320px; }
    .cesium-layer-list .title { font-weight:700; margin-bottom:6px; }
    .cesium-layer-list .last { margin-top:6px; font-size:0.85rem; opacity:0.9 }
    .cesium-attribution { position:absolute; left:12px; bottom:12px; z-index:60; background: rgba(0,0,0,0.55); color:#fff; padding:6px 8px; border-radius:4px; font-size:0.85rem }
    .cesium-error { position:absolute; left:50%; transform:translateX(-50%); top:12px; z-index:80; background: rgba(200,40,40,0.95); color:#fff; padding:8px 12px; border-radius:6px; font-weight:600 }`
  ]
})
export class CesiumMapComponent implements OnInit, OnDestroy {
  private viewer: any;
  terrainEnabled = false;
  debug = false;
  loaded: Array<any> = [];
  lastUrl = '';
  testUrl = '';
  attributionText = '';
  errorMessage = '';

  constructor(private layerService: LayerService) {}

  ngOnInit(): void {
    this.loadCesium().then(() => {
      const Cesium = (window as any).Cesium;
      try {
        this.viewer = new Cesium.Viewer('cesiumContainer', {
          baseLayerPicker: false,
          imageryProvider: new Cesium.OpenStreetMapImageryProvider({ url: 'https://a.tile.openstreetmap.org/' }),
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
          animation: false,
          timeline: false
        });

        // subscribe to uploaded layers
        try {
          this.layerService.layerAdded$.subscribe((ref: any) => {
            this.clearError();
            let urlOrId: any = ref;
            if (ref && typeof ref === 'object') {
              urlOrId = ref.url || ref.id || ref.layerUrl || JSON.stringify(ref);
            }
            this.lastUrl = urlOrId;

            const looksLikeUrl = typeof urlOrId === 'string' && /^(https?:)?\/\//.test(urlOrId);
            if (looksLikeUrl) {
              this.addDataSourceFromUrl(urlOrId).catch(err => this.showError('Failed to load layer: ' + this.formatError(err)));
            } else {
              // treat as ID or backend ref — call LayerService.getGeoJson
              try {
                this.layerService.getGeoJson(urlOrId).subscribe({
                  next: (geo: any) => {
                    try {
                      const blob = new (window as any).Blob([JSON.stringify(geo)], { type: 'application/geo+json' });
                      const tmpUrl = (window as any).URL.createObjectURL(blob);
                      this.addDataSourceFromUrl(tmpUrl).catch(err => this.showError('Failed to add fetched GeoJSON: ' + this.formatError(err)));
                    } catch (e) { this.showError('Invalid GeoJSON from backend'); }
                  },
                  error: (err: any) => this.showError('Failed to fetch converted GeoJSON from server: ' + this.formatError(err))
                });
              } catch (e) {
                this.showError('LayerService does not support getGeoJson for this ref');
              }
            }
          });
        } catch (e) { (window as any).console && (window as any).console.warn && (window as any).console.warn('LayerService subscribe failed for Cesium', e); }

      } catch (err) {
        this.showError('Failed to create Cesium viewer: ' + this.formatError(err));
        (window as any).console && (window as any).console.error && (window as any).console.error('Failed to create Cesium viewer', err);
      }
    }).catch(err => {
      this.showError('Failed to load Cesium script: ' + this.formatError(err));
      (window as any).console && (window as any).console.error && (window as any).console.error('Failed to load Cesium script', err);
    });
  }

  ngOnDestroy(): void {
    try { this.viewer && this.viewer.destroy && this.viewer.destroy(); } catch (e) { /* ignore */ }
  }

  async addDataSourceFromUrl(url: string): Promise<void> {
    const Cesium = (window as any).Cesium;
    if (!Cesium || !this.viewer) throw new Error('Cesium not ready');

    // try GeoJSON
    try {
      const ds = await Cesium.GeoJsonDataSource.load(url, { clampToGround: true });
      this.viewer.dataSources.add(ds);
      this.loaded.push({ type: 'geojson', ds, url, name: ds.name });
      this.updateAttributionFromDataSource(ds);
      return;
    } catch (e) {
      // not geojson
    }

    // try KML
    try {
      const kds = await Cesium.KmlDataSource.load(url);
      this.viewer.dataSources.add(kds);
      this.loaded.push({ type: 'kml', ds: kds, url, name: kds.name });
      this.updateAttributionFromDataSource(kds);
      return;
    } catch (e) {
      // not kml
    }

    // try 3DTiles
    try {
      const tileset = new Cesium.Cesium3DTileset({ url });
      this.viewer.scene.primitives.add(tileset);
      this.loaded.push({ type: '3dtiles', tileset, url, name: tileset.url });
      this.updateAttributionFromTileset(tileset);
      return;
    } catch (e) {
      // fallback
    }

    throw new Error('Unsupported layer type or failed to load: ' + url);
  }

  home() { try { this.viewer && this.viewer.camera && this.viewer.camera.flyHome(); } catch (e) { /* ignore */ } }

  toggleTerrain() {
    const Cesium = (window as any).Cesium;
    if (!Cesium || !this.viewer) return;
    if (this.terrainEnabled) {
      this.viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      this.terrainEnabled = false;
      this.attributionText = '';
    } else {
      try {
        // createWorldTerrain may require a token in some setups; wrap safely
        if (Cesium.createWorldTerrain) {
          this.viewer.terrainProvider = Cesium.createWorldTerrain();
          this.terrainEnabled = true;
          this.attributionText = 'Terrain: Cesium World Terrain (may require token)';
        } else {
          this.showError('Cesium World Terrain is not available in this build');
        }
      } catch (e) {
        this.showError('Failed to enable world terrain; using ellipsoid. ' + this.formatError(e));
        try { this.viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider(); } catch(_){}
        this.terrainEnabled = false;
      }
    }
  }

  toggleDebug() { this.debug = !this.debug; }

  loadTest() {
    if (!this.testUrl) return this.showError('Enter a URL to load');
    this.addDataSourceFromUrl(this.testUrl).catch(err => this.showError('Test load failed: ' + this.formatError(err)));
  }

  private updateAttributionFromDataSource(ds: any) {
    try {
      const credits = ds.attribution || ds.source && ds.source.attribution || ds.credit;
      this.attributionText = credits || 'Data loaded';
    } catch (e) { this.attributionText = 'Data loaded'; }
  }

  private updateAttributionFromTileset(tileset: any) {
    try {
      const meta = tileset.metadata || tileset.properties || tileset._urlMetadata;
      this.attributionText = meta?.attribution || tileset.url || '3D Tiles loaded';
    } catch (e) { this.attributionText = '3D Tiles loaded'; }
  }

  private showError(msg: string) {
    (window as any).console && (window as any).console.error && (window as any).console.error(msg);
    this.errorMessage = typeof msg === 'string' ? msg : JSON.stringify(msg);
    (window as any).setTimeout(() => { this.errorMessage = ''; }, 6000);
  }

  private clearError() { this.errorMessage = ''; }

  private formatError(err: any): string {
    try {
      if (!err) return '' + err;
      if (typeof err === 'string') return err;
      if ((err as any).message) return (err as any).message;
      return String(err);
    } catch (_) { return String(err); }
  }

  private loadCesium(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).Cesium) return resolve();
      const existing = (window as any).document.getElementById('cesium-script');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', (e: any) => reject(e));
        return;
      }

      const script = (window as any).document.createElement('script');
      script.id = 'cesium-script';
      script.src = '/assets/cesium/Cesium.js';
      script.onload = () => resolve();
      script.onerror = (e: any) => reject(e);
      (window as any).document.body.appendChild(script);
    });
  }
}
