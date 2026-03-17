import { Component, OnInit, OnDestroy,NgZone, ChangeDetectorRef  } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { LayerService } from '../../services/layer';
import { ModalService } from '../../services/modal.service';
import { FormsModule } from '@angular/forms';
import esriConfig from '@arcgis/core/config';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer';
import KMLLayer from '@arcgis/core/layers/KMLLayer';
import TileLayer from '@arcgis/core/layers/TileLayer';
import MapImageLayer from '@arcgis/core/layers/MapImageLayer';
import SceneLayer from '@arcgis/core/layers/SceneLayer';
import Basemap from '@arcgis/core/Basemap';
import LayerList from '@arcgis/core/widgets/LayerList';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Sketch from '@arcgis/core/widgets/Sketch';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils';

declare const window: any;
declare const console: any;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, HttpClientModule, FormsModule],
  templateUrl: './map.html',
  styleUrls: ['./map.css'],

})
export class MapComponent implements OnInit, OnDestroy {
  private map!: Map;
  private view: any;
  private mapView?: MapView;
  private sceneView?: SceneView;
  private sceneLayer?: SceneLayer;
  private userLayers: any[] = [];
  private graphicsLayer?: GraphicsLayer;
  private sketchWidget?: Sketch;
  private sceneLayerUrl: string | null = null;
  private forestLayer: any;
  private seismicLayer: any;
  private buildingLayer: any;
  private clickHandle: any = null;
  private popupActionHandle: any = null;
  private popupHandlerAbortFlag = { cancelled: false };

  is3DMode = false;
  showEditPanel = false;
  editProperties: { key: string; value: string }[] = [];
  editingFeatureId: number | null = null;
  editingLayerId: string | null = null;
  isSaving = false;
  saveSuccess = false;
  editingGraphic: Graphic | null = null;
  showFeaturePopup = false;
popupFeatureName = '';
popupAttributes: { key: string; value: string }[] = [];
popupGraphic: any = null;
popupBackendLayerId: string | null = null;

  constructor(
    private http: HttpClient,
    private layerService: LayerService,
    private modalService: ModalService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
  esriConfig.assetsPath = '/assets';
  this.map = new Map({ basemap: 'streets-navigation-vector' });
  this.createMapView();
  // DO NOT call addDefaultWidgets() here — createMapView().when() handles it

  this.layerService.layerAdded$.subscribe({
    next: (url: string) => {
      try { this.addFeatureLayerFromUrl(url); }
      catch {
        try {
          const k = new KMLLayer({ url });
          this.map.add(k);
          this.userLayers.push(k);
        } catch (err) { console.error('Failed to add uploaded layer', err); }
      }
    }
  });

  this.loadBackendLayers();

  }

  ngOnDestroy(): void {
    this.detachHandlers();
    this.view?.destroy();
  }

  // ── View ──────────────────────────────────────────────────────────────────

private createMapView(): void {
  this.mapView = new MapView({
    container: 'mapViewDiv',
    map: this.map,
    center: [80.7, 7.8],
    zoom: 7
  });
  this.view = this.mapView;

  // Everything that touches the view must be inside .when()
  this.mapView.when(() => {
    this.addDefaultWidgets();   // ← moved inside when()
    this.setupPopupHandler();
  });
}

  toggle3D(): void {
    this.is3DMode = !this.is3DMode;
    this.setViewMode(this.is3DMode ? '3d' : '2d');
  }

  async setViewMode(mode: '2d' | '3d'): Promise<void> {
  const is3d = mode === '3d';
  if (is3d && this.view?.type === '3d') return;
  if (!is3d && this.view?.type === '2d') return;

  this.detachHandlers();

  let currentViewpoint: any = null;
  if (this.view?.viewpoint) currentViewpoint = this.view.viewpoint.clone();
  if (this.view) this.view.container = null;

  const layerSnapshots = this.snapshotAndRemoveGeoJsonLayers();
  
  if (is3d) {
    if (!this.sceneView) {
      this.sceneView = new SceneView({
        container: 'mapViewDiv',
        map: this.map,
        viewingMode: 'global'
      });
      if (!this.sceneLayer && this.sceneLayerUrl) this.addSceneLayer(this.sceneLayerUrl);
    } else {
      this.sceneView.container = document.getElementById('mapViewDiv') as any;
    }
    this.view = this.sceneView;
  } else {
    if (!this.mapView) {
      this.createMapView();
      return; 
    } else {
      this.mapView.container = document.getElementById('mapViewDiv') as any;
    }
    this.view = this.mapView;
  }


  this.view.when(() => {
    this.addDefaultWidgets();    
    this.restoreGeoJsonLayers(layerSnapshots, is3d);
    this.setupPopupHandler();
    this.restoreViewpoint(currentViewpoint, is3d);
  });
}

  private addDefaultWidgets(): void {
    try {
      this.view.ui.add(new LayerList({ view: this.view }), 'top-left');
    } catch (e) { console.warn('Failed to add widgets', e); }
  }

  // ── Popup ─────────────────────────────────────────────────────────────────

 private setupPopupHandler(): void {
  if (!this.view) return;
  this.detachHandlers();

  this.popupHandlerAbortFlag.cancelled = true;
  const abortFlag = { cancelled: false };
  this.popupHandlerAbortFlag = abortFlag;

  const currentView = this.view;

  this.clickHandle = currentView.on('click', (event: any) => {
    const testLayers = this.userLayers.filter(
      (l: any) => l.type === 'geojson' || l.type === 'feature'
    );
    if (!testLayers.length) return;

    currentView.hitTest(event, { include: testLayers })
      .then((response: any) => {
        const hit = (response.results ?? []).find((r: any) => r.type === 'graphic');

        if (!hit) {
          this.ngZone.run(() => { this.showFeaturePopup = false; });
          return;
        }

        const graphic: any   = hit.graphic;
        const attrs          = graphic.attributes ?? {};
        const owningLayer    = graphic.layer;
        const backendLayerId = (owningLayer as any)?._backendLayerId ?? null;
        const featureName    = attrs.name || attrs.NAME || owningLayer?.title || 'Feature';

        this.ngZone.run(() => {
          this.popupFeatureName    = featureName;
          this.popupBackendLayerId = backendLayerId;
          this.popupGraphic        = graphic;
          this.popupAttributes     = Object.entries(attrs)
            .filter(([key]) =>
              !key.startsWith('F_') &&
              !key.startsWith('_') &&
              key !== 'OBJECTID' &&
              key !== 'ObjectID'
            )
            .map(([key, value]) => ({ key, value: String(value ?? '') }));
          this.showFeaturePopup = true;
          this.cdr.detectChanges();
          console.log('popup shown for:', featureName);
        });
      })
      .catch((err: any) => {
        if (err?.name !== 'AbortError') console.warn('hitTest error:', err);
      });
  });
}

  private detachHandlers(): void {
  this.clickHandle?.remove();
  this.clickHandle = null;
  this.popupActionHandle?.remove();
  this.popupActionHandle = null;
}

  private buildPopupContent(attributes: any): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = 'padding:4px 0;max-height:300px;overflow-y:auto';

  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;width:100%;font-size:13px';

  Object.entries(attributes)
    .filter(([key]) =>
      !key.startsWith('F_') &&
      !key.startsWith('_') &&
      key !== 'OBJECTID' &&
      key !== 'ObjectID'
    )
    .forEach(([key, value]) => {
      const row = table.insertRow();

      const keyCell = row.insertCell();
      keyCell.style.cssText = 'padding:5px 12px 5px 0;font-weight:600;color:#aaa;white-space:nowrap;vertical-align:top;font-size:12px';
      keyCell.textContent = key;

      const valCell = row.insertCell();
      valCell.style.cssText = 'padding:5px 0;word-break:break-word';
      valCell.textContent = String(value ?? '');
    });

  container.appendChild(table);
  return container;
}

  // ── Edit panel ────────────────────────────────────────────────────────────

  openEditPanel(feature: any, backendLayerId: string): void {
    const attrs = feature.attributes ?? {};

    this.editingFeatureId = attrs.F_db_id ?? attrs._db_id ?? null;
    this.editingLayerId   = backendLayerId;

    this.editProperties = Object.entries(attrs)
      .filter(([key]) =>
        !key.startsWith('F_') &&
        !key.startsWith('_') &&
        key !== 'OBJECTID' &&
        key !== 'ObjectID'
      )
      .map(([key, value]) => ({ key, value: String(value ?? '') }));

    this.showEditPanel = true;
    this.saveSuccess   = false;

    this.startGeometryEdit(feature);
    try { this.view.popup.close(); } catch { }
  }

  startGeometryEdit(feature: any): void {
    if (!this.view) return;

    if (!this.graphicsLayer) {
      this.graphicsLayer = new GraphicsLayer();
      this.map.add(this.graphicsLayer);
      this.userLayers.push(this.graphicsLayer);
    }

    if (!this.sketchWidget) {
      this.sketchWidget = new Sketch({
        layer: this.graphicsLayer,
        view:  this.view,
        creationMode: 'update'
      });
      this.view.ui.add(this.sketchWidget, 'top-right');
    }

    const isPoint  = feature.geometry?.type === 'point';
    const symbol: any = isPoint
      ? { type: 'simple-marker', color: [0, 255, 255, 0.8], size: 10, outline: { color: [0, 200, 255, 1], width: 2 } }
      : { type: 'simple-fill',   color: [0, 255, 255, 0.4], outline: { color: [0, 255, 255, 1], width: 2 } };

    this.editingGraphic = new Graphic({ geometry: feature.geometry.clone(), symbol });
    this.graphicsLayer.removeAll();
    this.graphicsLayer.add(this.editingGraphic);
    this.sketchWidget.update([this.editingGraphic], { tool: 'reshape' });
  }

  saveFeature(): void {
    if (!this.editingFeatureId || !this.editingLayerId || this.isSaving) return;
    this.isSaving = true;

    const properties: Record<string, string> = {};
    this.editProperties.forEach(p => { properties[p.key] = p.value; });

    const geojsonGeometry = this.editingGraphic?.geometry
      ? this.convertToGeoJson(this.editingGraphic.geometry)
      : null;

    const currentLayerId = this.editingLayerId;

    this.layerService
      .updateFeature(currentLayerId, this.editingFeatureId, properties, geojsonGeometry)
      .subscribe({
        next: () => {
          this.saveSuccess = true;
          this.layerService.emitToast('Feature saved successfully!');
          this.cancelEdit();
          this.refreshSingleGeoJsonLayer(currentLayerId);
        },
        error: (err: any) => {
          console.error('Save failed', err);
          this.layerService.emitToast('Save failed. Please try again.');
          this.isSaving = false;
        }
      });
  }

  cancelEdit(): void {
    this.showEditPanel    = false;
    this.editProperties   = [];
    this.editingFeatureId = null;
    this.editingLayerId   = null;
    this.isSaving         = false;
    this.saveSuccess      = false;
    this.sketchWidget?.cancel();
    this.graphicsLayer?.removeAll();
    this.editingGraphic   = null;
  }

  openEditFromPopup(): void {
  if (!this.popupGraphic || !this.popupBackendLayerId) return;
  this.showFeaturePopup = false;
  this.openEditPanel(this.popupGraphic, this.popupBackendLayerId);
}

closeFeaturePopup(): void {
  this.showFeaturePopup = false;
}

  // ── Layer helpers ─────────────────────────────────────────────────────────

  private buildRenderers(geometryType: string): { renderer2D: any; renderer3D: any } {
    if (geometryType === 'Point' || geometryType === 'MultiPoint') {
      const r = { type: 'simple', symbol: { type: 'simple-marker', color: [255, 100, 0, 0.9], size: 8, outline: { color: [255, 255, 255], width: 1 } } };
      return { renderer2D: r, renderer3D: r };
    }
    return {
      renderer2D: { type: 'simple', symbol: { type: 'simple-fill', color: [255, 0, 255, 0.5], outline: { color: [255, 255, 255], width: 1 } } },
      renderer3D: { type: 'simple', symbol: { type: 'polygon-3d', symbolLayers: [{ type: 'extrude', size: 15, material: { color: [0, 200, 255, 0.9] }, edges: { type: 'solid', color: [0, 80, 120, 1.0], size: 0.5 } }] } }
    };
  }

  private addGeoJsonLayerToMap(geoJson: any, title: string, backendLayerId: string): GeoJSONLayer | null {
    if (!geoJson?.features?.length) { console.warn('GeoJSON has no features:', title); return null; }

    const { renderer2D, renderer3D } = this.buildRenderers(geoJson.features[0].geometry.type);
    const blob    = new Blob([JSON.stringify(geoJson)], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);

    const layer = new GeoJSONLayer({
      url:           blobUrl,
      title,
      renderer:      this.is3DMode ? renderer3D : renderer2D,
      elevationInfo: { mode: 'on-the-ground' },
      outFields:     ['*']
    });

    (layer as any).customRenderer2D = renderer2D;
    (layer as any).customRenderer3D = renderer3D;
    (layer as any)._blobUrl         = blobUrl;
    (layer as any)._geoJsonData     = geoJson;
    (layer as any)._backendLayerId  = backendLayerId;

    this.map.add(layer);
    this.userLayers.push(layer);
    return layer;
  }

  refreshSingleGeoJsonLayer(backendLayerId: string): void {
    const targetLayer: any = this.userLayers.find(l => (l as any)._backendLayerId === backendLayerId);
    if (!targetLayer) return;

    this.layerService.getLayerGeoJson(backendLayerId).subscribe({
      next: (geoJson: any) => {
        const blob   = new Blob([JSON.stringify(geoJson)], { type: 'application/json' });
        const newUrl = URL.createObjectURL(blob);
        if (targetLayer._blobUrl) URL.revokeObjectURL(targetLayer._blobUrl);
        targetLayer._geoJsonData = geoJson;
        targetLayer._blobUrl     = newUrl;
        targetLayer.url          = newUrl;
      },
      error: (err: any) => console.error('Failed to refresh GeoJSON layer', err)
    });
  }

  // ── 2D↔3D helpers ────────────────────────────────────────────────────────

  private snapshotAndRemoveGeoJsonLayers(): any[] {
    const snapshots: any[] = [];
    for (const layer of this.userLayers) {
      const geoJsonData = (layer as any)._geoJsonData;
      const r2d         = (layer as any).customRenderer2D;
      const r3d         = (layer as any).customRenderer3D;
      if (geoJsonData && r2d && r3d) {
        try { this.map.remove(layer); } catch { /* ignore */ }
        if ((layer as any)._blobUrl) { try { URL.revokeObjectURL((layer as any)._blobUrl); } catch { /* ignore */ } }
        snapshots.push({
          title:         layer.title,
          geoJsonData,
          r2d,
          r3d,
          backendLayerId: (layer as any)._backendLayerId ?? null
        });
      }
    }
    this.userLayers = this.userLayers.filter((l: any) => !l._geoJsonData);
    return snapshots;
  }

  private restoreGeoJsonLayers(snapshots: any[], is3d: boolean): void {
    for (const { title, geoJsonData, r2d, r3d, backendLayerId } of snapshots) {
      try {
        const newBlob  = new Blob([JSON.stringify(geoJsonData)], { type: 'application/json' });
        const newUrl   = URL.createObjectURL(newBlob);
        const newLayer = new GeoJSONLayer({
          url:           newUrl,
          title,
          renderer:      is3d ? r3d : r2d,
          elevationInfo: { mode: 'on-the-ground' },
          outFields:     ['*']
        });
        (newLayer as any).customRenderer2D = r2d;
        (newLayer as any).customRenderer3D = r3d;
        (newLayer as any)._geoJsonData     = geoJsonData;
        (newLayer as any)._blobUrl         = newUrl;
        (newLayer as any)._backendLayerId  = backendLayerId;
        this.map.add(newLayer);
        this.userLayers.push(newLayer);
      } catch (e) { console.warn('Failed to restore layer', title, e); }
    }
  }

  private restoreViewpoint(viewpoint: any, is3d: boolean): void {
    if (!viewpoint) return;
    if (is3d) {
      this.view.goTo({ target: viewpoint.targetGeometry ?? viewpoint.center, scale: viewpoint.scale, tilt: 60 })
        .catch(() => { try { this.view.viewpoint = viewpoint; } catch { /* ignore */ } });
    } else {
      try { this.view.viewpoint = viewpoint; } catch { /* ignore */ }
    }
  }

  // ── Backend loading ───────────────────────────────────────────────────────

  private loadBackendLayers(): void {
    this.layerService.listLayers().subscribe({
      next: (layers: any) => {
        if (!layers) return;
        const items: any[] = Array.isArray(layers) ? layers : (layers.items ?? layers);
        (items || []).forEach((l: any) => {
          if (l.url && typeof l.url === 'string') {
            try { this.addFeatureLayerFromUrl(l.url); } catch { /* ignore */ }
          } else if (l.id) {
            this.layerService.getGeoJson(l.id).subscribe({
              next: (g: any) => {
                try {
                  if (g?.type === 'FeatureCollection') {
                    this.addGeoJsonLayerToMap(g, l.name ?? `layer-${l.id}`, l.id);
                  } else if (g?.url) {
                    const geo = new GeoJSONLayer({ url: g.url, title: l.name ?? `layer-${l.id}` });
                    this.map.add(geo);
                    this.userLayers.push(geo);
                  }
                } catch (err) { console.error('Failed to add GeoJSON layer', err); }
              },
              error: (err: any) => console.warn('getGeoJson failed for', l.id, err)
            });
          }
        });
      },
      error: (err: any) => console.warn('listLayers failed', err)
    });
  }

  // ── File upload ───────────────────────────────────────────────────────────

  uploadFile(event: any): void {
    const file = (event.target as any).files?.[0];
    if (!file) return;

    this.layerService.uploadLayer(file, file.name).subscribe({
      next: (res: any) => {
        if (!res?.id) return;
        this.layerService.getLayerGeoJson(res.id).subscribe({
          next: (geoJson: any) => {
            const layer = this.addGeoJsonLayerToMap(geoJson, res.layerName ?? `layer-${res.id}`, res.id);
            layer?.when(() => {
              if (layer.fullExtent) this.view.goTo(layer.fullExtent).catch((e: any) => console.warn(e));
            });
          },
          error: (err: any) => console.error('Failed to fetch layer GeoJSON', err)
        });
      },
      error: (err: any) => console.error('Upload failed', err)
    });
  }

  // ── Basemap ───────────────────────────────────────────────────────────────

  async addEnterpriseBasemap(): Promise<void> {
    const url = await this.modalService.prompt('Enter ArcGIS Enterprise Tile/MapServer URL:');
    if (!url) return;
    try { this.map.basemap = new Basemap({ baseLayers: [new TileLayer({ url })] }); }
    catch {
      try { this.map.basemap = new Basemap({ baseLayers: [new MapImageLayer({ url })] }); }
      catch (err) { console.error('Failed to add basemap', err); window.alert('Failed to add basemap.'); }
    }
  }

  private addSceneLayer(url: string): void {
    try { this.sceneLayer = new SceneLayer({ url }); this.map.add(this.sceneLayer); }
    catch (err) { console.error('Failed to add SceneLayer', err); window.alert('Failed to add SceneLayer.'); }
  }

  // ── Geometry conversion ───────────────────────────────────────────────────

  private convertToGeoJson(geometry: any): any {
    const geo: any = webMercatorUtils.webMercatorToGeographic(geometry);
    if (geo.type === 'point')    return { type: 'Point',      coordinates: [geo.longitude, geo.latitude] };
    if (geo.type === 'polyline') return { type: 'LineString', coordinates: geo.paths[0] };
    if (geo.type === 'polygon')  return { type: 'Polygon',    coordinates: geo.rings };
    return null;
  }

  // ── Overlay toggles ───────────────────────────────────────────────────────

  async toggleForestDensity(enabled: boolean): Promise<void> {
    if (enabled) {
      if (!this.forestLayer) {
        const url = await this.modalService.prompt('Enter Feature/Tile layer URL for Forest Density:');
        this.forestLayer = url ? this.tryFeatureOrTile(url) : new GraphicsLayer({ title: 'Forest Density' });
        this.map.add(this.forestLayer);
        this.userLayers.push(this.forestLayer);
      } else { try { this.map.add(this.forestLayer); } catch { /* ignore */ } }
    } else { try { this.map.remove(this.forestLayer); } catch { /* ignore */ } }
  }

  async toggleSeismicActivity(enabled: boolean): Promise<void> {
    if (enabled) {
      if (!this.seismicLayer) {
        const url = await this.modalService.prompt('Enter Feature/Tile layer URL for Seismic Activity:');
        this.seismicLayer = url ? this.tryFeatureOrTile(url) : new GraphicsLayer({ title: 'Seismic Activity' });
        this.map.add(this.seismicLayer);
        this.userLayers.push(this.seismicLayer);
      } else { try { this.map.add(this.seismicLayer); } catch { /* ignore */ } }
    } else { try { this.map.remove(this.seismicLayer); } catch { /* ignore */ } }
  }

  async toggleBuildingFootprints(enabled: boolean): Promise<void> {
    if (enabled) {
      if (!this.buildingLayer) {
        const input = await this.modalService.prompt('Enter Feature/Scene layer URL (blank = OSM 3D Buildings):');
        const url   = input?.trim() || 'https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer';
        this.buildingLayer = url.includes('SceneServer') ? new SceneLayer({ url }) : new FeatureLayer({ url, outFields: ['*'] });
        this.map.add(this.buildingLayer);
        this.userLayers.push(this.buildingLayer);
      } else { try { this.map.add(this.buildingLayer); } catch { /* ignore */ } }
    } else { try { this.map.remove(this.buildingLayer); } catch { /* ignore */ } }
  }

  private tryFeatureOrTile(url: string): FeatureLayer | TileLayer {
    try { return new FeatureLayer({ url, outFields: ['*'] }); }
    catch { return new TileLayer({ url }); }
  }

  // ── FeatureLayer ──────────────────────────────────────────────────────────

  async addFeatureLayer(): Promise<void> {
    const url = await this.modalService.prompt('Enter Feature Layer URL:');
    if (url) this.addFeatureLayerFromUrl(url);
  }

  addFeatureLayerFromUrl(url: string): void {
    const layer = new FeatureLayer({ url, outFields: ['*'] });
    this.map.add(layer);
    this.userLayers.push(layer);

    layer.queryFeatures({ where: '1=1', outFields: ['*'], returnGeometry: true })
      .then((results: any) => {
        const feats = (results?.features ?? []).map((f: any) => ({
          attributes: f.attributes, geometry: f.geometry, layerUrl: layer.url
        }));
        this.layerService.setCurrentFeatures(feats);
      })
      .catch((err: any) => console.warn('queryFeatures failed', err));
  }

  async addKMLLayer(): Promise<void> {
    const url = await this.modalService.prompt('Enter KML URL:');
    if (!url) return;
    const kml = new KMLLayer({ url });
    this.map.add(kml);
    this.userLayers.push(kml);
  }

  // ── Drawing tools ─────────────────────────────────────────────────────────

  startSketch(): void {
    if (!this.view) return;
    if (!this.graphicsLayer) { this.graphicsLayer = new GraphicsLayer(); this.map.add(this.graphicsLayer); this.userLayers.push(this.graphicsLayer); }
    if (!this.sketchWidget)  { this.sketchWidget  = new Sketch({ layer: this.graphicsLayer, view: this.view }); this.view.ui.add(this.sketchWidget, 'top-right'); }
    try { this.sketchWidget.create('polyline'); } catch (e) { console.warn('Sketch create failed', e); }
  }

  addPinAtCenter(): void {
    if (!this.view) return;
    if (!this.graphicsLayer) { this.graphicsLayer = new GraphicsLayer(); this.map.add(this.graphicsLayer); this.userLayers.push(this.graphicsLayer); }
    const center = this.view.center;
    this.graphicsLayer.add(new Graphic({
      geometry: { type: 'point', longitude: center.x ?? center[0], latitude: center.y ?? center[1] } as any,
      symbol:   { type: 'simple-marker', style: 'circle', color: [255, 77, 79, 0.95], size: '14px', outline: { color: [255, 255, 255, 0.9], width: 2 } } as any
    }));
  }

  clearUserLayers(): void {
    for (const l of this.userLayers) { try { this.map.remove(l); } catch { /* ignore */ } }
    this.userLayers = [];
    this.graphicsLayer?.removeAll();
  }

  showAttributes(): void {
    const layer = this.map.layers.find(l => l.type === 'feature') as FeatureLayer | undefined;
    if (!layer) { console.warn('No FeatureLayer found'); return; }
    layer.queryFeatures({ where: '1=1', outFields: ['*'], num: 200 } as any)
      .then(results => console.table(results.features.map((f: any) => f.attributes)))
      .catch(err => console.error('QueryFeatures failed', err));
  }

  getSceneLayerUrl(): string  { return this.sceneLayerUrl ?? ''; }
  setSceneLayerUrl(url: string | null): void { this.sceneLayerUrl = url; }
}