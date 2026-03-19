import { Component, OnInit, NgZone, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LayerService, UploadedLayer } from '../../services/layer';

@Component({
  selector: 'app-files',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './files.html',
  styleUrls: ['./files.css'],
  changeDetection: ChangeDetectionStrategy.Default // Ensure Default (not OnPush)
})
export class FilesComponent implements OnInit {
  layers: UploadedLayer[] = [];
  isLoading = true;
  errorMessage = '';

  constructor(
    private layerService: LayerService,
    private router: Router,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef  // <-- inject this
  ) {}

  ngOnInit() {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges(); // force render loading state immediately

    this.layerService.listLayers().subscribe({
      next: (data) => {
        console.log('API Response:', data);
        this.ngZone.run(() => {
          this.layers = Array.isArray(data) ? [...data] : []; // spread to create new array reference
          this.isLoading = false;
          this.errorMessage = '';
          this.cdr.detectChanges(); // force re-render after data arrives
        });
      },
      error: (err) => {
        console.error('Full error object:', err);
        this.ngZone.run(() => {
          this.errorMessage = `Failed to load layers: ${err.status} - ${err.message}`;
          this.isLoading = false;
          this.cdr.detectChanges(); // force re-render on error
        });
      }
    });
  }

  viewOnMap(layerId: string) {
    this.router.navigate(['/'], { queryParams: { layer: layerId } });
  }

    deleteFile(layerId: string) {
    if (!confirm('Are you sure you want to permanently delete this spatial layer and all its geometries?')) {
      return;
    }

    this.isLoading = true;
    this.cdr.detectChanges();

    this.layerService.deleteLayer(layerId).subscribe({
      next: () => {
        // Filter out the deleted file from the local state array immediately
        this.layers = this.layers.filter(l => l.id !== layerId);
        this.isLoading = false;
        this.cdr.detectChanges(); // Ensure the view physically drops the card
      },
      error: (err) => {
        console.error('Delete failed', err);
        this.errorMessage = `Failed to delete layer: ${err.message}`;
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  getFormatIcon(format: string): string {
    switch (format?.toUpperCase()) {
      case 'ZIP': return '🗜️';
      case 'KML': return '🌍';
      case 'GEOJSON': return '📍';
      default: return '📄';
    }
  }

  getFormatColor(format: string): string {
    switch (format?.toUpperCase()) {
      case 'ZIP': return '#f5a623';
      case 'KML': return '#4ea8ff';
      case 'GEOJSON': return '#32d296';
      default: return '#a0b2c6';
    }
  }
}