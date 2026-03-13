import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'An unknown error occurred!';
      
      if (error.error instanceof ErrorEvent) {
        // Client-side error
        errorMessage = `Error: ${error.error.message}`;
      } else {
        // Server-side error (Spring Boot response)
        const serverError = error.error;
        const serverMessage =
          (typeof serverError === 'string' && serverError.trim()) ||
          serverError?.message ||
          serverError?.error ||
          error.statusText ||
          error.message;

        const isUploadEndpoint = req.url.includes('/layers/upload');

        if (error.status === 0) {
          errorMessage = 'Cannot reach backend API. Make sure the backend is running on port 8080.';
        } else if (isUploadEndpoint && error.status >= 500) {
          errorMessage =
            'Upload failed on server (500).\n' +
            'Please use a valid shapefile ZIP with .shp, .shx, and .dbf in the ZIP root (not nested folders).';
        } else {
          errorMessage = `Error Code: ${error.status}\nMessage: ${serverMessage}`;
        }

        console.error('Backend Error:', error);
      }
      
      // OPTIONAL: Using a Toast service here is great
      alert(errorMessage); 
      
      return throwError(() => error);
    })
  );
};