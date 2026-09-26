import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { REQUEST_STATUSES, RequestStatus } from './request-status';

export class ChangeStatusDto {
  @IsIn(REQUEST_STATUSES, { message: 'status must be NEW, IN_PROGRESS, or DONE' })
  status!: RequestStatus;

  // Optional message to the requester, saved with the status change.
  @IsOptional()
  @IsString({ message: 'note must be text' })
  @MaxLength(2000, { message: 'note must be at most 2000 characters' })
  note?: string;
}
