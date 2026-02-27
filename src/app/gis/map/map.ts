import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { LayerService } from '../../services/layer';
import esriConfig from '@arcgis/core/config';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import KMLLayer from '@arcgis/core/layers/KMLLayer';
import TileLayer from '@arcgis/core/layers/TileLayer';
import MapImageLayer from '@arcgis/core/layers/MapImageLayer';
import SceneLayer from '@arcgis/core/layers/SceneLayer';
import Basemap from '@arcgis/core/Basemap';
import Editor from '@arcgis/core/widgets/Editor';
import LayerList from '@arcgis/core/widgets/LayerList';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Sketch from '@arcgis/core/widgets/Sketch';

declare const window: any;
declare const console: any;
declare function prompt(message?: string): string | null;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  template: `
    <div style="display:flex;flex-direction:column;height:100vh;">
      <div style="padding:8px;display:flex;gap:8px;align-items:center;">
        <button (click)="addFeatureLayer()">Add Feature Layer</button>
        <button (click)="addKMLLayer()">Add KML Layer</button>
        <button (click)="addEnterpriseBasemap()">Add ArcGIS Enterprise Basemap</button>
        <button (click)="showAttributes()">Show Attributes</button>
        <input type="file" (change)="uploadFile($event)" />
      </div>
      <div id="mapViewDiv" style="flex:1;"></div>
    </div>
  `,
  styles: [`
    :host { display:block; height:100%; width:100%; }
    #mapViewDiv { height:100%; width:100%; }
    /* You can add global styles to this file, and also import other style files */
   
  `]
})
export class MapComponent implements OnInit, OnDestroy {
  private map!: Map;
  // view may be MapView or SceneView
  private view: any;
  private sceneView?: SceneView;
  private sceneLayer?: SceneLayer;
  private userLayers: any[] = [];
  private graphicsLayer?: GraphicsLayer;
  private sketchWidget?: Sketch;
  // Default public SceneLayer URL (example). Replace with your SceneServer URL to auto-load 3D buildings.
  // Example public SceneLayer (may be rate-limited or changed by provider):
  // https://tiles.arcgis.com/tiles/P3ePLMYs2RVChkJx/arcgis/rest/services/LosAngeles_3D_Buildings/SceneServer
  private sceneLayerUrl: string | null = 'https://tiles.arcgis.com/tiles/P3ePLMYs2RVChkJx/arcgis/rest/services/LosAngeles_3D_Buildings/SceneServer';
  private forestLayer: any;
  private seismicLayer: any;
  private buildingLayer: any;

  constructor(private http: HttpClient, private layerService: LayerService) {}

  ngOnInit(): void {
    esriConfig.assetsPath = '/assets';

    this.map = new Map({ basemap: 'streets-navigation-vector' });

    // default to 2D MapView
    this.createMapView();

    // add widgets for initial view
    const editor = new Editor({ view: this.view });
    this.view.ui.add(editor, 'top-right');

    const layerList = new LayerList({ view: this.view });
    this.view.ui.add(layerList, 'top-left');

    // subscribe to uploaded layers and auto-add them to the map
    try {
      this.layerService.layerAdded$.subscribe((url: string) => {
        console.info('Layer uploaded, adding to map:', url);
        // attempt to add as FeatureLayer, otherwise KML
        try {
          this.addFeatureLayerFromUrl(url);
        } catch (e) {
          try { const k = new KMLLayer({ url }); this.map.add(k); this.userLayers.push(k); }
          catch (err) { console.error('Failed to add uploaded layer', err); }
        }
        // add an Editor for editing the newly added layer
        try {
          const addedLayer: any = this.map.layers.getItemAt(this.map.layers.length - 1);
          if (addedLayer) {
            const editor2 = new Editor({ view: this.view, layerInfos: [{ layer: addedLayer as any }] });
            this.view.ui.add(editor2, 'top-right');
          }
        } catch (err) { /* ignore */ }
      });
    } catch (e) { console.warn('LayerService subscribe failed', e); }
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  uploadFile(event: any) {
    const file = (event.target as any).files?.[0];
    if (!file) return;
    const formData = new (window as any).FormData();
    formData.append('file', file);

    this.http.post<{ layerUrl: string }>('http://localhost:8080/api/upload', formData)
      .subscribe({
        next: res => { if (res?.layerUrl) this.addFeatureLayerFromUrl(res.layerUrl); },
        error: err => console.error('Upload failed', err)
      });
  }

  addEnterpriseBasemap() {
    const url = prompt('Enter ArcGIS Enterprise Tile/MapServer URL (e.g. https://.../MapServer or /TileServer):');
    if (!url) return;

    // try creating a TileLayer first, fallback to MapImageLayer
    let layer: any;
    try {
      layer = new TileLayer({ url });
      const basemap = new Basemap({ baseLayers: [layer] });
      this.map.basemap = basemap;
      return;
    } catch (e) {
      try {
        layer = new MapImageLayer({ url });
        const basemap = new Basemap({ baseLayers: [layer] });
        this.map.basemap = basemap;
        return;
      } catch (err) {
        console.error('Failed to add enterprise basemap', err);
        window.alert('Failed to add basemap. Check the URL and CORS/token settings.');
      }
    }
  }

  /**
   * Switch between 2D (MapView) and 3D (SceneView).
   */
  setViewMode(mode: '2d' | '3d') {
    // if already in requested mode do nothing
    const is3d = mode === '3d';
    if (is3d && this.sceneView) return;
    if (!is3d && this.view && this.view.type === '3d') {
      // switch to 2d
    }

    // destroy existing view
    try { this.view?.destroy(); } catch (e) { /* ignore */ }

    if (is3d) {
      // create SceneView
      this.sceneView = new SceneView({
        container: 'mapViewDiv',
        map: this.map,
        center: [80.7, 7.8],
        zoom: 16,
        viewingMode: 'local',
        camera: {
          position: {
            x: 80.7,
            y: 7.8,
            z: 1200
          },
          tilt: 60
        }
      });
      this.view = this.sceneView;
      // attempt to add a 3D building SceneLayer automatically if configured
      if (!this.sceneLayer) {
        if (this.sceneLayerUrl) {
          this.addSceneLayer(this.sceneLayerUrl);
        } else {
          // prompt the user whether they'd like to load a 3D building layer
          try {
            const load = window.confirm('Enter 3D mode — automatically load a 3D building SceneLayer? Click OK to provide a URL, Cancel to skip.');
            if (load) {
              const url = prompt('SceneLayer URL (SceneServer endpoint):');
              if (url) {
                this.sceneLayerUrl = url;
                this.addSceneLayer(url);
              }
            }
          } catch (e) {
            console.info('User interaction for scene layer skipped or blocked.', e);
          }
        }
      }
    } else {
      this.createMapView();
    }

    // re-add widgets to the active view
    const editor = new Editor({ view: this.view });
    this.view.ui.add(editor, 'top-right');

    const layerList = new LayerList({ view: this.view });
    this.view.ui.add(layerList, 'top-left');
  }

  private createMapView() {
    this.view = new MapView({
      container: 'mapViewDiv',
      map: this.map,
      center: [80.7, 7.8],
      zoom: 7
    });
  }

  private addSceneLayer(url: string) {
    try {
      this.sceneLayer = new SceneLayer({ url });
      this.map.add(this.sceneLayer);
      console.info('SceneLayer added:', url);
    } catch (err) {
      console.error('Failed to add SceneLayer', err);
      window.alert('Failed to add SceneLayer. Check the URL or permissions.');
    }
  }

  toggleForestDensity(enabled: boolean) {
    if (enabled) {
      if (!this.forestLayer) {
        const url = prompt('Enter Feature/Tile layer URL for Forest Density (leave blank to add empty placeholder):');
        if (url) {
          try {
            this.forestLayer = new FeatureLayer({ url, outFields: ['*'] });
          } catch (e) {
            this.forestLayer = new TileLayer({ url });
          }
        } else {
          this.forestLayer = new GraphicsLayer({ title: 'Forest Density' });
        }
        this.map.add(this.forestLayer);
        this.userLayers.push(this.forestLayer);
      } else {
        try { this.map.add(this.forestLayer); } catch (e) { /* ignore */ }
      }
    } else {
      if (this.forestLayer) { try { this.map.remove(this.forestLayer); } catch (e) { } }
    }
  }

  toggleSeismicActivity(enabled: boolean) {
    if (enabled) {
      if (!this.seismicLayer) {
        const url = prompt('Enter Feature/Tile layer URL for Seismic Activity (leave blank to add empty placeholder):');
        if (url) {
          try { this.seismicLayer = new FeatureLayer({ url, outFields: ['*'] }); }
          catch (e) { this.seismicLayer = new TileLayer({ url }); }
        } else {
          this.seismicLayer = new GraphicsLayer({ title: 'Seismic Activity' });
        }
        this.map.add(this.seismicLayer);
        this.userLayers.push(this.seismicLayer);
      } else { try { this.map.add(this.seismicLayer); } catch (e) { } }
    } else {
      if (this.seismicLayer) { try { this.map.remove(this.seismicLayer); } catch (e) { } }
    }
  }

  toggleBuildingFootprints(enabled: boolean) {
    if (enabled) {
      if (!this.buildingLayer) {
        const url = prompt('Enter Feature/Scene layer URL for Building Footprints (SceneServer/FeatureServer) (leave blank to add placeholder):');
        if (url) {
          // if in 3d prefer SceneLayer
          if (this.sceneView) {
            try { this.buildingLayer = new SceneLayer({ url }); }
            catch (e) { this.buildingLayer = new FeatureLayer({ url, outFields: ['*'] }); }
          } else {
            try { this.buildingLayer = new FeatureLayer({ url, outFields: ['*'] }); }
            catch (e) { this.buildingLayer = new TileLayer({ url }); }
          }
        } else {
          this.buildingLayer = new GraphicsLayer({ title: 'Building Footprints' });
        }
        this.map.add(this.buildingLayer);
        this.userLayers.push(this.buildingLayer);
      } else { try { this.map.add(this.buildingLayer); } catch (e) { } }
    } else {
      if (this.buildingLayer) { try { this.map.remove(this.buildingLayer); } catch (e) { } }
    }
  }

  addFeatureLayer() {
    const url = prompt('Enter Feature Layer URL:');
    if (url) this.addFeatureLayerFromUrl(url);
  }

  addFeatureLayerFromUrl(url: string) {
    const layer = new FeatureLayer({ url, outFields: ['*'] });
    this.map.add(layer);
    this.userLayers.push(layer);
  }

  addKMLLayer() {
    const url = prompt('Enter KML URL:');
    if (!url) return;
    const kmlLayer = new KMLLayer({ url });
    this.map.add(kmlLayer);
    this.userLayers.push(kmlLayer);
  }

  getSceneLayerUrl() { return this.sceneLayerUrl ?? ''; }
  setSceneLayerUrl(url: string | null) { this.sceneLayerUrl = url; }

  /** Start a sketch tool for drawing (polyline) */
  startSketch() {
    if (!this.view) return;
    if (!this.graphicsLayer) {
      this.graphicsLayer = new GraphicsLayer();
      this.map.add(this.graphicsLayer);
      this.userLayers.push(this.graphicsLayer);
    }

    if (!this.sketchWidget) {
      this.sketchWidget = new Sketch({ layer: this.graphicsLayer, view: this.view });
      this.view.ui.add(this.sketchWidget, 'top-right');
    }

    // create a polyline sketch
    try { this.sketchWidget.create('polyline'); }
    catch (e) { console.warn('Sketch create failed', e); }
  }

  addPinAtCenter() {
    if (!this.view) return;
    const center = this.view.center;
    if (!this.graphicsLayer) {
      this.graphicsLayer = new GraphicsLayer();
      this.map.add(this.graphicsLayer);
      this.userLayers.push(this.graphicsLayer);
    }

    const pt = { type: 'point', longitude: center.x ?? center[0], latitude: center.y ?? center[1] } as any;
    const symbol = {
      type: 'simple-marker',
      style: 'circle',
      color: [255, 77, 79, 0.95],
      size: '14px',
      outline: { color: [255,255,255,0.9], width: 2 }
    } as any;

    const g = new Graphic({ geometry: pt, symbol });
    this.graphicsLayer.add(g);
  }

  clearUserLayers() {
    // remove layers that were added by the user
    for (const l of this.userLayers) {
      try { this.map.remove(l); } catch (e) { /* ignore */ }
    }
    this.userLayers = [];
    // also clear graphics
    if (this.graphicsLayer) {
      this.graphicsLayer.removeAll();
    }
  }

  showAttributes() {
    const layer = this.map.layers.find(l => l.type === 'feature') as FeatureLayer | undefined;
    if (!layer) { console.warn('No FeatureLayer found'); return; }

    const query = layer.createQuery();
    query.where = '1=1';
    query.outFields = ['*'];
    query.num = 200;

    layer.queryFeatures(query)
      .then(results => console.table(results.features.map((f: any) => f.attributes)))
      .catch(err => console.error('QueryFeatures failed', err));
  }
}
