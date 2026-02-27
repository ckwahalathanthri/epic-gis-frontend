import { Component } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { LayerService } from '../../services/layer';
import { HttpClientModule } from '@angular/common/http';
declare const console: any;

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './upload.html',
  styleUrls: ['./upload.css']
})
export class UploadComponent {
  uploading = false;
  message = '';
  progress = 0;

  constructor(private layerService: LayerService) {}

  onFile(event: any) {
    const files: any = event.target?.files ?? null;
    if (!files || files.item(0) === null) return;
    this.uploadFiles(files);
  }

  onDrop(ev: any) {
    ev.preventDefault();
    const files: any = ev.dataTransfer?.files ?? null;
    if (!files || files.item(0) === null) return;
    this.uploadFiles(files);
  }

  uploadFiles(files: any) {
    this.uploading = true;
    this.progress = 0;
    this.message = '';

    const fileListOrArray: any[] = Array.from(files as any);

    this.layerService.uploadFiles(fileListOrArray).subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.UploadProgress) {
          const percentDone = Math.round(100 * (event.loaded / (event.total || 1)));
          this.progress = percentDone;
          return;
        }
        if (event.type === HttpEventType.Response) {
          const body = event.body;
          this.message = 'Uploaded: ' + (body?.id ?? 'ok');
          this.uploading = false;
          // notify map of uploaded layer URL when backend returns one
          const layerUrl = body?.layerUrl ?? body?.url ?? body?.data?.layerUrl;
          if (layerUrl) this.layerService.notifyLayerAdded(layerUrl);
        }
      },
      error: (err) => {
        console.error('Upload failed', err);
        this.message = 'Upload failed';
        this.uploading = false;
      }
    });
  }
}
