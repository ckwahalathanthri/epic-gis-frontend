import { Component, OnInit, OnDestroy } from '@angular/core';
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
import Editor from '@arcgis/core/widgets/Editor';
import LayerList from '@arcgis/core/widgets/LayerList';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Sketch from '@arcgis/core/widgets/Sketch';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';

declare const window: any;
declare const console: any;
declare function prompt(message?: string): string | null;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, HttpClientModule, FormsModule],
  templateUrl: './map.html',
  styleUrls: ['./map.css']   
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
  is3DMode: boolean = false; 
  showEditPanel = false;
  editProperties: { key: string; value: string }[] = [];
  editingFeatureId: number | null = null;
  editingLayerId: string | null = null;
  isSaving = false;
  saveSuccess = false;

  constructor(private http: HttpClient, private layerService: LayerService, private modalService: ModalService) {}

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

    // load existing layers from backend
    try {
      this.layerService.listLayers().subscribe({
        next: (layers: any) => {
          if (!layers) return;
          // layers may be array or object with items
          const items = Array.isArray(layers) ? layers : (layers.items ?? layers);
          (items || []).forEach((l: any) => {
            // if descriptor has direct url (FeatureServer/KML), try adding as FeatureLayer
            if (l.url && typeof l.url === 'string') {
              try { this.addFeatureLayerFromUrl(l.url); }
              catch (e) { console.warn('addFeatureLayerFromUrl failed, trying KML/GeoJSON', e); }
            } else if (l.id) {
              // fetch geojson for this layer id
              this.layerService.getGeoJson(l.id).subscribe({
                next: (g: any) => {
                    try {
                    // If backend returned a URL, use it
                    if (g && typeof g === 'object' && g.type === 'FeatureCollection') {
                      if (!g.features || g.features.length === 0) return;
                      
                      const firstGeom = g.features[0].geometry.type;
                      let renderer2D: any;
                      let renderer3D: any;

                      if (firstGeom === 'Point' || firstGeom === 'MultiPoint') {
                          renderer2D = renderer3D = {
                              type: "simple",
                              symbol: {
                                  type: "simple-marker",
                                  color: [255, 100, 0, 0.9],
                                  size: 8,
                                  outline: { color: [255, 255, 255], width: 1 }
                              }
                          };
                      } else {
                          renderer2D = {
                              type: "simple",
                              symbol: {
                                  type: "simple-fill",
                                  color: [255, 0, 255, 0.5], // Pink
                                  outline: { color: [255, 255, 255], width: 1 }
                              }
                          };

                          renderer3D = {
                              type: "simple",
                              symbol: {
                                  type: "polygon-3d",
                                  symbolLayers: [{
                                      type: "extrude",
                                      size: 15,
                                      material: { color: [0, 200, 255, 0.9] }, // Bright cyan
                                      edges: { type: "solid", color: [0, 80, 120, 1.0], size: 0.5 }
                                  }]
                              }
                           };
                      }

                      const blob = new (window as any).Blob([JSON.stringify(g)], { type: 'application/json' });
                      const url = (window as any).URL.createObjectURL(blob);
                      
                      const geo = new GeoJSONLayer({ 
                          url, 
                          title: l.name ?? ('layer-' + l.id),
                          renderer: this.is3DMode ? renderer3D : renderer2D,
                          elevationInfo: { mode: "on-the-ground" }
                      });
                      
                      // Attach renderers and data for view switching
                      (geo as any).customRenderer2D = renderer2D;
                      (geo as any).customRenderer3D = renderer3D;
                      (geo as any)._blobUrl = url;
                      (geo as any)._geoJsonData = g;
                      
                      this.map.add(geo);
                      this.userLayers.push(geo);
                    } else if (g && g.url) {
                      const geo = new GeoJSONLayer({ url: g.url, title: l.name ?? ('layer-' + l.id) });
                      this.map.add(geo);
                      this.userLayers.push(geo);
                    }
                  } catch (err) { console.error('Failed to add geojson layer', err); }
                },
                error: (err: any) => { console.warn('getGeoJson failed for', l.id, err); }
              });
            }
          });
        },
        error: (err: any) => { console.warn('listLayers failed', err); }
      });
    } catch (e) {
      console.warn('Failed to load layers from backend', e);
    }
  }

  toggle3D() {
    this.is3DMode = !this.is3DMode;
    this.setViewMode(this.is3DMode ? '3d' : '2d');
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  uploadFile(event: any) {
    const file = (event.target as any).files?.[0];
    if (!file) return;

    // Use the LayerService to upload, which handles the correct URL and parameters
    this.layerService.uploadLayer(file, file.name).subscribe({
        next: (res: any) => {
            console.log('Upload successful:', res);
            
            if (res && res.id) {
                 console.info('Layer ID ' + res.id + ' created. Fetching GeoJSON...');
                 
                 // Fetch the GeoJSON and display it immediately
                 this.layerService.getLayerGeoJson(res.id).subscribe({
                     next: (geoJson: any) => {
                         console.log('GeoJSON fetched:', geoJson);

                         if (!geoJson.features || geoJson.features.length === 0) {
                             console.warn('GeoJSON has no features.');
                             return;
                         }

                         // Determine Geometry Type to pick a visible style
                         const firstGeom = geoJson.features[0].geometry.type;
                         let renderer2D: any;
                         let renderer3D: any;

                         if (firstGeom === 'Point' || firstGeom === 'MultiPoint') {
                             // Bright Orange Dots for Points (Looks the same in 2D and 3D)
                             renderer2D = renderer3D = {
                                 type: "simple",
                                 symbol: {
                                     type: "simple-marker",
                                     color: [255, 100, 0, 0.9],
                                     size: 8,
                                     outline: { color: [255, 255, 255], width: 1 }
                                 }
                             };
                         } else {
                             // 2D Pink Polygons
                             renderer2D = {
                                 type: "simple",
                                 symbol: {
                                     type: "simple-fill",
                                     color: [255, 0, 255, 0.5], // Pink
                                     outline: { color: [255, 255, 255], width: 1 }
                                 }
                             };

                             // 3D Extruded Polygons - fixed 15m height, no Arcade (avoids expression failures)
                             renderer3D = {
                                 type: "simple",
                                 symbol: {
                                     type: "polygon-3d",
                                     symbolLayers: [{
                                         type: "extrude",
                                         size: 15,
                                         material: { color: [0, 200, 255, 0.9] }, // Bright cyan - easy to see
                                         edges: { type: "solid", color: [0, 80, 120, 1.0], size: 0.5 }
                                     }]
                                 }
                              };
                                 
                            }
                         
                         // Create a blob URL for the GeoJSONLayer
                         const blob = new Blob([JSON.stringify(geoJson)], { type: 'application/json' });
                         const url = URL.createObjectURL(blob);
                         
                         const sampleProps = geoJson.features[0]?.properties || {};
const fieldInfos = Object.keys(sampleProps)
    .filter((k: string) => k !== '_db_id')
    .map((key: string) => ({ fieldName: key, label: key }));
const popupTemplate: any = {
    title: 'Feature Details',
    content: [{ type: 'fields', fieldInfos }],
    actions: [{ id: 'edit-feature', title: '✏️ Edit Feature', className: 'esri-icon-edit' }]
};

const layer = new GeoJSONLayer({
    url: url,
    title: res.layerName || ('layer-' + res.id),
    renderer: this.is3DMode ? renderer3D : renderer2D,
    elevationInfo: { mode: 'on-the-ground' },
    popupTemplate
});

(layer as any).customRenderer2D = renderer2D;
(layer as any).customRenderer3D = renderer3D;
(layer as any)._blobUrl = url;
(layer as any)._geoJsonData = geoJson;
(layer as any)._backendLayerId = res.id;
(layer as any)._popupTemplate = popupTemplate;
                         
                         this.map.add(layer);
                         this.userLayers.push(layer); // <--- Make sure this is added to track it!
                         console.info('Layer added to map.');
                         
                         // Try to zoom to the layer extent once loaded
                         layer.when(() => {
                            if (layer.fullExtent) {
                                this.view.goTo(layer.fullExtent).catch((e: any) => console.warn(e));
                            }
                         });
                     },
                     error: (err: any) => console.error('Failed to fetch layer GeoJSON', err)
                 });
            }
        },
        error: (err: any) => console.error('Upload failed', err)
    });
  }


  async addEnterpriseBasemap() {
    const url = await this.modalService.prompt('Enter ArcGIS Enterprise Tile/MapServer URL (e.g. https://.../MapServer or /TileServer):');
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
  async setViewMode(mode: '2d' | '3d') {
    const is3d = mode === '3d';
    if (is3d && this.view?.type === '3d') return;
    if (!is3d && this.view?.type === '2d') return;

    // 1. Capture viewport before detaching
    let currentViewpoint: any = null;
    if (this.view?.viewpoint) {
      currentViewpoint = this.view.viewpoint.clone();
    }
    if (this.view) {
      this.view.container = null;
    }

    // 2. PULL ALL GEOJSON LAYERS OUT OF THE MAP *BEFORE* CREATING THE NEW VIEW.
    //    Critical: SceneView scans this.map the moment it's constructed.
    //    If GeoJSON layers are already present it compiles 2D LayerViews for them,
    //    and no amount of renderer swapping will make extrusion work afterwards.
    //    By stripping them here the new view initialises with a clean pipeline.
    const layerDataSnapshot: Array<{title: string; geoJsonData: any; r2d: any; r3d: any; backendLayerId: string | null; popupTemplate: any}> = [];
    for (const layer of this.userLayers) {
      const geoJsonData = (layer as any)._geoJsonData;
      const r2d = (layer as any).customRenderer2D;
      const r3d = (layer as any).customRenderer3D;
      if (geoJsonData && r2d && r3d) {
        try { this.map.remove(layer); } catch (_) {}
        if ((layer as any)._blobUrl) {
          try { URL.revokeObjectURL((layer as any)._blobUrl); } catch (_) {}
        }
        layerDataSnapshot.push({
  title: layer.title, geoJsonData, r2d, r3d,
  backendLayerId: (layer as any)._backendLayerId ?? null,
  popupTemplate: (layer as any)._popupTemplate ?? null
});
      }
    }
    // Keep only non-GeoJSON layers in the tracking array
    this.userLayers = this.userLayers.filter((l: any) => !l._geoJsonData);

    // 3. Create / reattach the target view (map is now clean of GeoJSON layers)
    if (is3d) {
      if (!this.sceneView) {
        this.sceneView = new SceneView({
          container: 'mapViewDiv',
          map: this.map,
          viewingMode: 'global',
        });
        if (!this.sceneLayer && this.sceneLayerUrl) {
          this.addSceneLayer(this.sceneLayerUrl);
        }
      } else {
        this.sceneView.container = document.getElementById('mapViewDiv') as any;
      }
      this.view = this.sceneView;
    } else {
      if (!this.mapView) {
        this.createMapView();
      } else {
        this.mapView.container = document.getElementById('mapViewDiv') as any;
      }
      this.view = this.mapView;
    }

    // 4. After the view's WebGL pipeline is fully ready, inject fresh layers.
    //    At this point the SceneView 3D pipeline is compiled and waiting –
    //    any GeoJSONLayer added now will get a proper 3D LayerView.
    this.view.when(() => {
      for (const { title, geoJsonData, r2d, r3d,backendLayerId, popupTemplate } of layerDataSnapshot) {
        try {
          const newBlob = new Blob([JSON.stringify(geoJsonData)], { type: 'application/json' });
          const newUrl = URL.createObjectURL(newBlob);

          const newLayer = new GeoJSONLayer({
            url: newUrl,
            title,
            renderer: is3d ? r3d : r2d,
            elevationInfo: { mode: 'on-the-ground' },
            popupTemplate: popupTemplate ?? undefined
          });

          (newLayer as any).customRenderer2D = r2d;
      (newLayer as any).customRenderer3D = r3d;
      (newLayer as any)._geoJsonData = geoJsonData;
      (newLayer as any)._blobUrl = newUrl;
      (newLayer as any)._backendLayerId = backendLayerId;
      (newLayer as any)._popupTemplate = popupTemplate;

          this.map.add(newLayer);
          this.userLayers.push(newLayer);
          console.info(`Layer added to ${is3d ? '3D' : '2D'} pipeline:`, title);
        } catch (e) {
          console.warn('Failed to recreate layer', title, e);
        }
      }

      this.setupPopupHandler();

      // Restore viewport
      if (currentViewpoint) {
        if (is3d) {
          this.view.goTo({
            target: currentViewpoint.targetGeometry ?? currentViewpoint.center,
            scale: currentViewpoint.scale,
            tilt: 60
          }).catch((e: any) => {
            try { this.view.viewpoint = currentViewpoint; } catch (_) {}
          });
        } else {
          try { this.view.viewpoint = currentViewpoint; }
          catch (e) { console.warn('Could not restore viewpoint', e); }
        }
      }
    });

    // 5. Refresh UI Widgets
    try {
      this.view.ui.empty();
      const editor = new Editor({ view: this.view });
      this.view.ui.add(editor, 'top-right');
      const layerList = new LayerList({ view: this.view });
      this.view.ui.add(layerList, 'top-left');
    } catch (e) {
      console.warn('Failed to add widgets', e);
    }
  }

  private createMapView() {
    this.mapView = new MapView({
      container: 'mapViewDiv',
      map: this.map,
      center: [80.7, 7.8],
      zoom: 7
    });
    this.view = this.mapView;
    this.mapView.when(() => {       
    this.setupPopupHandler();
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

  private setupPopupHandler() {
  if (!this.view) return;
  try {
    reactiveUtils.on(
      () => this.view.popup,
      'trigger-action',
      (event: any) => {
        if (event.action.id === 'edit-feature') {
          const feature = this.view.popup.selectedFeature;
          if (!feature) return;
          const layer = feature.layer;
          const backendLayerId = (layer as any)?._backendLayerId;
          if (backendLayerId) {
            this.openEditPanel(feature.attributes, backendLayerId);
          }
        }
      }
    );
  } catch (e) {
    console.warn('Could not set up popup handler', e);
  }
}

openEditPanel(attributes: any, backendLayerId: string) {
  this.editingFeatureId = attributes._db_id ?? null;
  this.editingLayerId = backendLayerId;
  this.editProperties = Object.entries(attributes)
    .filter(([key]) => key !== '_db_id' && key !== 'OBJECTID' && key !== 'ObjectID' && !key.startsWith('_'))
    .map(([key, value]) => ({ key, value: String(value ?? '') }));
  this.showEditPanel = true;
  this.saveSuccess = false;
  try { this.view.popup.close(); } catch (e) {}
}

saveFeature() {
  if (!this.editingFeatureId || !this.editingLayerId || this.isSaving) return;
  this.isSaving = true;
  const properties: any = {};
  this.editProperties.forEach(p => { properties[p.key] = p.value; });
  this.layerService.updateFeature(this.editingLayerId, this.editingFeatureId, properties).subscribe({
    next: () => {
      this.isSaving = false;
      this.saveSuccess = true;
      this.layerService.emitToast('Feature saved successfully!');
      setTimeout(() => { this.saveSuccess = false; this.showEditPanel = false; }, 1800);
    },
    error: (err: any) => {
      console.error('Save failed', err);
      this.layerService.emitToast('Save failed. Please try again.');
      this.isSaving = false;
    }
  });
}

cancelEdit() {
  this.showEditPanel = false;
  this.editProperties = [];
  this.editingFeatureId = null;
  this.editingLayerId = null;
  this.isSaving = false;
  this.saveSuccess = false;
}

  async toggleForestDensity(enabled: boolean) {
    if (enabled) {
      if (!this.forestLayer) {
        const url = await this.modalService.prompt('Enter Feature/Tile layer URL for Forest Density (leave blank to add empty placeholder):');;
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

  async toggleSeismicActivity(enabled: boolean) {
    if (enabled) {
      if (!this.seismicLayer) {
        const url = await this.modalService.prompt('Enter Feature/Tile layer URL for Seismic Activity (leave blank to add empty placeholder):');;
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

  async toggleBuildingFootprints(enabled: boolean) {
    if (enabled) {
      if (!this.buildingLayer) {
        const urlInput = await this.modalService.prompt('Enter Feature/Scene layer URL for Building Footprints (leave blank for default 3D Buildings):');
        const url = urlInput ? urlInput.trim() : 'https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer';
        
        if (url) {
          if (url.includes('SceneServer')) {
             this.buildingLayer = new SceneLayer({ url });
          } else {
             // For FeatureLayers, add a basic 3D extrusion renderer so it looks 3D in SceneView
             const renderer = {
               type: 'simple',
               symbol: {
                 type: 'polygon-3d',
                 symbolLayers: [{
                   type: 'extrude',
                   size: 15, // 15 meters height
                   material: { color: '#B0C4DE' },
                   edges: { type: 'solid', color: '#555', size: 1.0 }
                 }]
               }
             } as any;
             this.buildingLayer = new FeatureLayer({ 
                 url, 
                 outFields: ['*'],
                 // Only apply 3D renderer when in 3D mode otherwise 2D will fallback appropriately or we can just apply null
             });
             // Setting the renderer to a 3D renderer will automatically apply when viewed in 3D, 
             // but if they start in 2D, we might want to toggle it during setViewMode.
             // For now we add it directly.
             (this.buildingLayer as any)._isBuildingFeatureLayer = true;
          }
        }
        
        this.map.add(this.buildingLayer);
        this.userLayers.push(this.buildingLayer);
      } else { 
        try { this.map.add(this.buildingLayer); } catch (e) { } 
      }
    } else {
      if (this.buildingLayer) { try { this.map.remove(this.buildingLayer); } catch (e) { } }
    }
  }

  async addFeatureLayer() {
    const url = await this.modalService.prompt('Enter Feature Layer URL:');
    if (url) this.addFeatureLayerFromUrl(url);
  }

  addFeatureLayerFromUrl(url: string) {
    const layer = new FeatureLayer({ url, outFields: ['*'] });
    this.map.add(layer);
    this.userLayers.push(layer);

    // query features and set current features for attributes table
    try {
      layer.queryFeatures({ where: '1=1', outFields: ['*'], returnGeometry: true })
        .then((results: any) => {
          const feats = (results?.features ?? []).map((f: any) => ({
            attributes: f.attributes,
            geometry: f.geometry,
            layerUrl: layer.url
          }));
          this.layerService.setCurrentFeatures(feats);
        })
        .catch((err: any) => console.warn('queryFeatures failed', err));
    } catch (e) { console.warn('queryFeatures error', e); }

    // add popup actions for edit/delete
    try {
      this.view.popup.actions.removeAll?.();
      this.view.popup.actions.add({ id: 'edit', title: 'Edit', className: 'esri-icon-edit' });
      this.view.popup.actions.add({ id: 'delete', title: 'Delete', className: 'esri-icon-trash' });

      this.view.popup.on('trigger-action', async (evt: any) => {
        const id = evt.action.id;
        const selected = this.view.popup.selectedFeature;
        if (!selected) return;
        const attrs = selected.attributes;
        const objectId = attrs.objectId ?? attrs.OBJECTID ?? attrs.FID ?? attrs.id;
        if (id === 'edit') {
          const newName = await this.modalService.prompt('Enter new name', attrs?.name ?? '');
          if (newName == null) return;
          const updates = [{ attributes: { objectId, name: newName } }];
          this.layerService.applyEditsProxy(layer.url!, { updates }).subscribe({ next: () => { this.layerService.emitToast('Edited feature'); }, error: (err: any) => { console.error(err); this.layerService.emitToast('Edit failed'); } });
        } else if (id === 'delete') {
          if (!(await this.modalService.confirm('Delete this feature?'))) return;
          this.layerService.applyEditsProxy(layer.url!, { deletes: [objectId] }).subscribe({ next: () => { this.layerService.emitToast('Deleted feature'); }, error: (err: any) => { console.error(err); this.layerService.emitToast('Delete failed'); } });
        }
      });
    } catch (e) { console.warn('popup action setup failed', e); }
  }

  async addKMLLayer() {
    const url = await this.modalService.prompt('Enter KML URL:');
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
