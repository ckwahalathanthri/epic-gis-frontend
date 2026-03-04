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
        errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
        console.error('Backend Error:', error);
      }
      
      // OPTIONAL: Using a Toast service here is great
      alert(errorMessage); 
      
      return throwError(() => error);
    })
  );
};