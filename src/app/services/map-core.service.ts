import { Injectable, NgZone } from '@angular/core';
import esriConfig from '@arcgis/core/config';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer';
import VectorTileLayer from '@arcgis/core/layers/VectorTileLayer'; 
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

@Injectable({
  providedIn: 'root'
})
export class MapCoreService {
  public map!: Map;
  public view: any;
  public mapView?: MapView;
  public sceneView?: SceneView;
  public sceneLayer?: SceneLayer;
  
  public userLayers: any[] = [];
  public graphicsLayer?: GraphicsLayer;
  public sketchWidget?: Sketch;
  public sceneLayerUrl: string | null = null;
  
  public formatLayers: {
    forest?: any;
    seismic?: any;
    building?: any;
  } = {};

  constructor(private ngZone: NgZone) {
    esriConfig.assetsPath = '/assets';
  }

  // ── Initialization ──────────────────────────────────────────
  
  initMap(containerId: string): void {
    this.map = new Map({ basemap: 'streets-navigation-vector' });
    this.createMapView(containerId);
  }

  private createMapView(containerId: string): void {
    this.mapView = new MapView({
      container: containerId,
      map: this.map,
      center: [80.7, 7.8],
      zoom: 7
    });
    this.view = this.mapView;
  }

  addDefaultWidgets(): void {
    try {
      this.view.ui.add(new LayerList({ view: this.view }), 'top-left');
    } catch (e) {
      console.warn('Failed to add widgets', e);
    }
  }

  // ── 2D/3D Swap Logic ────────────────────────────────────────

    async switchMode(is3D: boolean): Promise<void> {
    if (is3D && this.view?.type === '3d') return;
    if (!is3D && this.view?.type === '2d') return;

    let currentViewpoint: any = null;
    if (this.view?.viewpoint) currentViewpoint = this.view.viewpoint.clone();
    if (this.view) this.view.container = null; // Unbind existing container

    if (is3D) {
      if (!this.sceneView) {
        this.sceneView = new SceneView({ container: 'mapViewDiv', map: this.map, viewingMode: 'global' });
        if (!this.sceneLayer && this.sceneLayerUrl) this.addSceneLayer(this.sceneLayerUrl);
      } else {
        this.sceneView.container = document.getElementById('mapViewDiv') as any;
      }
      this.view = this.sceneView;
    } else {
      if (!this.mapView) {
        this.createMapView('mapViewDiv');
        return;
      } else {
        this.mapView.container = document.getElementById('mapViewDiv') as any;
      }
      this.view = this.mapView;
    }

    this.view.when(() => {
      this.addDefaultWidgets();
      this.restoreViewpoint(currentViewpoint, is3D);
    });
  }

  // ── Hit Testing / Events ──────────────────────────────────────
  
  hitTestLayers(event: any): Promise<any> {
    const testLayers = this.userLayers.filter((l: any) => l.type === 'geojson' || l.type === 'feature');
    if (!testLayers.length) return Promise.resolve(null);
    return this.view.hitTest(event, { include: testLayers });
  }

  // ── GeoJSON Generation ────────────────────────────────────────

  addGeoJsonLayerToMap(geoJson: any, title: string, backendLayerId: string, is3DMode: boolean): GeoJSONLayer | null {
    if (!geoJson?.features?.length) { console.warn('GeoJSON has no features:', title); return null; }

    const { renderer2D, renderer3D } = this.buildRenderers(geoJson.features[0].geometry.type);
    const blob = new Blob([JSON.stringify(geoJson)], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);

    const layer = new GeoJSONLayer({
      url: blobUrl, title,
      renderer: is3DMode ? renderer3D : renderer2D,
      elevationInfo: { mode: 'on-the-ground' },
      outFields: ['*']
    });

    (layer as any).customRenderer2D = renderer2D;
    (layer as any).customRenderer3D = renderer3D;
    (layer as any)._blobUrl = blobUrl;
    (layer as any)._geoJsonData = geoJson;
    (layer as any)._backendLayerId = backendLayerId;

    this.map.add(layer);
    this.userLayers.push(layer);
    return layer;
  }

    // ── Vector Tile Generation (High Performance) ──────────────────

  addVectorTileLayerToMap(layerId: string, title: string): VectorTileLayer {
    const layer = new VectorTileLayer({
      title: title,
      style: {
        version: 8,
        sources: {
          'epic-source': {
            type: 'vector',
            tiles: [ `http://localhost:8080/api/layers/${layerId}/tiles/{z}/{x}/{y}.pbf` ]
          }
        },
        layers: [
          {
            id: 'epic-layer-fill',
            type: 'fill',
            source: 'epic-source',
            'source-layer': 'default',
            paint: {
              'fill-color': '#ff00ff',
              'fill-opacity': 0.4
            }
          },
          {
            id: 'epic-layer-line',
            type: 'line',
            source: 'epic-source',
            'source-layer': 'default',
            paint: {
              'line-color': '#00ffff',
              'line-width': 2
            }
          },
          {
            id: 'epic-layer-circle',
            type: 'circle',
            source: 'epic-source',
            'source-layer': 'default',
            paint: {
              'circle-color': '#ff6400',
              'circle-radius': 4,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1
            }
          }
        ]
      }
    });
    
    // Track it just like we do with GeoJSON layers
    (layer as any)._backendLayerId = layerId;
    
    this.map.add(layer);
    this.userLayers.push(layer);
    
    return layer;
  }

  removeLayerByBackendId(backendLayerId: string): any {
    const targetIndex = this.userLayers.findIndex(l => (l as any)._backendLayerId === backendLayerId);
    if (targetIndex === -1) return null;

    const oldLayer = this.userLayers[targetIndex];
    this.map.remove(oldLayer);
    this.userLayers.splice(targetIndex, 1);
    if (oldLayer._blobUrl) URL.revokeObjectURL(oldLayer._blobUrl);
    return oldLayer;
  }

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

  // ── URL & External Layers ──────────────────────────────────────

  addFeatureLayerFromUrl(url: string, callback?: (feats: any[]) => void): FeatureLayer {
    const layer = new FeatureLayer({ url, outFields: ['*'] });
    this.map.add(layer);
    this.userLayers.push(layer);
    layer.queryFeatures({ where: '1=1', outFields: ['*'], returnGeometry: true })
      .then((results: any) => {
        const feats = (results?.features ?? []).map((f: any) => ({ attributes: f.attributes, geometry: f.geometry, layerUrl: layer.url }));
        if (callback) callback(feats);
      })
      .catch((err: any) => console.warn('queryFeatures failed', err));
      
    return layer; // RETURN THE LAYER
  }

  addKML(url: string): void {
    const kml = new KMLLayer({ url });
    this.map.add(kml);
    this.userLayers.push(kml);
  }

  addBasemap(url: string): void {
    try { this.map.basemap = new Basemap({ baseLayers: [new TileLayer({ url })] }); }
    catch {
      try { this.map.basemap = new Basemap({ baseLayers: [new MapImageLayer({ url })] }); }
      catch (err) { console.error('Failed to add basemap', err); }
    }
  }

  addSceneLayer(url: string): void {
    try {
      this.sceneLayer = new SceneLayer({ url });
      this.map.add(this.sceneLayer);
    } catch (err) { console.error('Failed to add SceneLayer', err); }
  }

  // ── Geometry Extraction ───────────────────────────────────────

  startGeometryEdit(feature: any): Graphic {
    if (!this.graphicsLayer) {
      this.graphicsLayer = new GraphicsLayer();
      this.map.add(this.graphicsLayer);
      this.userLayers.push(this.graphicsLayer);
    }

    if (!this.sketchWidget) {
      this.sketchWidget = new Sketch({
        layer: this.graphicsLayer,
        view: this.view,
        creationMode: 'update'
      });
      this.view.ui.add(this.sketchWidget, 'top-right');
    }

    const isPoint = feature.geometry?.type === 'point';
    const symbol: any = isPoint
      ? { type: 'simple-marker', color: [0, 255, 255, 0.8], size: 10, outline: { color: [0, 200, 255, 1], width: 2 } }
      : { type: 'simple-fill',   color: [0, 255, 255, 0.4], outline: { color: [0, 255, 255, 1], width: 2 } };

    const editingGraphic = new Graphic({ geometry: feature.geometry.clone(), symbol });
    this.graphicsLayer.removeAll();
    this.graphicsLayer.add(editingGraphic);
    this.sketchWidget.update([editingGraphic], { tool: 'reshape' });
    
    return editingGraphic;
  }

  cancelEditSession(): void {
    this.sketchWidget?.cancel();
    this.graphicsLayer?.removeAll();
  }

  convertToGeoJson(geometry: any): any {
    const geo: any = webMercatorUtils.webMercatorToGeographic(geometry);
    if (geo.type === 'point') return { type: 'Point', coordinates: [geo.longitude, geo.latitude] };
    if (geo.type === 'polyline') return { type: 'LineString', coordinates: geo.paths[0] };
    if (geo.type === 'polygon') return { type: 'Polygon', coordinates: geo.rings };
    return null;
  }

  // ── 3D Viewpoint Internals ────────────────────────────────────

  private snapshotAndRemoveGeoJsonLayers(): any[] {
    const snapshots: any[] = [];
    for (const layer of this.userLayers) {
      const geoJsonData = (layer as any)._geoJsonData;
      const r2d = (layer as any).customRenderer2D;
      const r3d = (layer as any).customRenderer3D;
      if (geoJsonData && r2d && r3d) {
        try { this.map.remove(layer); } catch { /* ignore */ }
        if ((layer as any)._blobUrl) { try { URL.revokeObjectURL((layer as any)._blobUrl); } catch { /* ignore */ } }
        snapshots.push({ title: layer.title, geoJsonData, r2d, r3d, backendLayerId: (layer as any)._backendLayerId ?? null });
      }
    }
    this.userLayers = this.userLayers.filter((l: any) => !l._geoJsonData);
    return snapshots;
  }

  private restoreGeoJsonLayers(snapshots: any[], is3d: boolean): void {
    for (const { title, geoJsonData, r2d, r3d, backendLayerId } of snapshots) {
      try {
        const newBlob = new Blob([JSON.stringify(geoJsonData)], { type: 'application/json' });
        const newUrl = URL.createObjectURL(newBlob);
        const newLayer = new GeoJSONLayer({
          url: newUrl, title,
          renderer: is3d ? r3d : r2d,
          elevationInfo: { mode: 'on-the-ground' },
          outFields: ['*']
        });
        (newLayer as any).customRenderer2D = r2d;
        (newLayer as any).customRenderer3D = r3d;
        (newLayer as any)._geoJsonData = geoJsonData;
        (newLayer as any)._blobUrl = newUrl;
        (newLayer as any)._backendLayerId = backendLayerId;
        this.map.add(newLayer);
        this.userLayers.push(newLayer);
      } catch (e) {
        console.warn('Failed to restore layer', title, e);
      }
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

      addGeoJsonLayerFromUrl(url: string, title?: string): GeoJSONLayer {
    const layer = new GeoJSONLayer({
      url: url,
      title: title ?? 'GeoJSON Layer',
      outFields: ['*']
    });
    this.map.add(layer);
    this.userLayers.push(layer);
    return layer;
  }
}