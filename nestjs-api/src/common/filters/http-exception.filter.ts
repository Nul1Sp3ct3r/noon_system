import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Flatten NestJS exception response into a plain string or array of strings
    // so clients always receive { message: string | string[] } — never a nested object.
    const raw =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const message: string | string[] =
      typeof raw === 'string'
        ? raw
        : Array.isArray((raw as any)?.message)
          ? ((raw as any).message as unknown[]).map(String)
          : typeof (raw as any)?.message === 'string'
            ? (raw as any).message
            : JSON.stringify(raw);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
