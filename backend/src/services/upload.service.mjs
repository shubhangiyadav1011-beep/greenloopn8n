import { randomUUID } from 'node:crypto';
import { requireThat, text } from '../validation.mjs';

export function createUploadService({ uploadModel, datasetService }) {
  return {
    create(user, input) {
      const name = text(input.name, 'filename', 250);
      const match = /^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(input.data ?? '');
      requireThat(match, 'Upload a PNG, JPEG, WebP, or PDF.');
      const content = Buffer.from(match[2], 'base64');
      requireThat(content.length > 0 && content.length <= 4 * 1024 * 1024, 'Files must be no larger than 4 MB.');
      const mime = match[1];
      const valid = mime === 'application/pdf' ? content.subarray(0, 5).toString() === '%PDF-'
        : mime === 'image/png' ? content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          : mime === 'image/jpeg' ? content[0] === 255 && content[1] === 216 && content[2] === 255
            : content.subarray(0, 4).toString() === 'RIFF' && content.subarray(8, 12).toString() === 'WEBP';
      requireThat(valid, 'The file content does not match its type.');
      const total = uploadModel.totalBytesForUser(user.id);
      requireThat(total + content.length <= 100 * 1024 * 1024, 'Account upload limit reached.', 413);
      const id = randomUUID();
      uploadModel.create({ id, userId: user.id, name, mime, content });
      return { ref: `/api/uploads/${id}` };
    },
    get(user, id) {
      const upload = uploadModel.findById(id);
      requireThat(upload, 'File not found.', 404);
      const dataset = datasetService.getVisibleDataset(user);
      const ref = `/api/uploads/${upload.id}`;
      requireThat(upload.user_id === user.id || [...dataset.materials, ...dataset.verifications].some(item => item.evidence.some(evidence => evidence.ref === ref)), 'You do not have access to this file.', 403);
      return upload;
    },
  };
}
