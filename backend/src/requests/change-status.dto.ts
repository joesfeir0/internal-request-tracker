import { IsIn } from 'class-validator';
import { REQUEST_STATUSES, RequestStatus } from './request-status';

export class ChangeStatusDto {
  @IsIn(REQUEST_STATUSES, { message: 'status must be NEW, IN_PROGRESS, or DONE' })
  status!: RequestStatus;
}
