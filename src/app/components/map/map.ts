import { Component, OnInit, OnDestroy, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as Cesium from 'cesium';

declare const window: any;
declare const console: any;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [],
  templateUrl: './map.html',
  styleUrl: './map.css'
})
export class Map implements OnInit, OnDestroy { // Renamed from Map to MapComponent
  private viewer: any;

  constructor(private el: ElementRef, private http: HttpClient) {}

  async ngOnInit() {
    if (typeof window !== 'undefined') {
      (window as any).CESIUM_BASE_URL = '/assets/cesium/cesium/Build/Cesium';
    }
    
    try {
      const terrain = await Cesium.Terrain.fromWorldTerrain();
      this.viewer = new Cesium.Viewer(this.el.nativeElement.querySelector('#cesiumContainer'), {
        terrain: terrain,
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        shouldAnimate: false,
      });

      const arcgisProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
      );
      this.viewer.imageryLayers.addImageryProvider(arcgisProvider);
    } catch (err) {
      console.error('Failed to create terrain, falling back:', err);
      this.viewer = new Cesium.Viewer(this.el.nativeElement.querySelector('#cesiumContainer'), {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        shouldAnimate: false,
      });
    }
  }

  ngOnDestroy() {
    if (this.viewer) {
      this.viewer.destroy();
    }
  }

  async addGeoJsonLayer(geoJson: any, name = 'layer') {
    const ds = await Cesium.GeoJsonDataSource.load(geoJson, {
      clampToGround: true
    });
    ds.name = name;
    this.viewer.dataSources.add(ds);
    this.viewer.flyTo(ds);
    // apply simple per-feature styling if properties exist
    ds.entities.values.forEach((e: any) => {
      if (e.point) {
        e.point.pixelSize = 8;
        e.point.color = Cesium.Color.fromCssColorString('#FF3388'); 
      }
      if (e.polyline) {
        e.polyline.width = 3;
        e.polyline.material = Cesium.Color.YELLOW;
      }
      if (e.polygon) {
        e.polygon.material = Cesium.Color.fromAlpha(Cesium.Color.CORNFLOWERBLUE, 0.45);
      }
    });
    return ds;
  }
  
  // Build a GeoJSON FeatureCollection from the first matching datasource entities
  exportDataSourceToGeoJson(dsName: string) {
    const ds = this.viewer.dataSources.getByName(dsName)[0];
    if (!ds) return null;
    const features: any[] = [];
    ds.entities.values.forEach((e: any) => {
      // Cesium does not have a built-in static serialize method on GeoJsonDataSource.
      // You would typically use a library like toGeoJSON to convert entities back to GeoJSON.
    });
    // Fallback: use DataSource's underlying original GeoJSON if present
    return null;
  }
}
