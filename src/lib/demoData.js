// Demo data loader — fetches from /public/data/ (served by Vite dev server and build)
import { importTrainingFile, importRequirementsFile } from './dataImport.js';

export async function loadDemoDataFromPublic() {
  const [trainingRes, reqRes] = await Promise.all([
    fetch('/data/sample-training-data.csv'),
    fetch('/data/sample-requirements.csv'),
  ]);

  if (!trainingRes.ok || !reqRes.ok) {
    throw new Error('Failed to fetch demo data files from /public/data/');
  }

  const trainingBlob = await trainingRes.blob();
  const reqBlob = await reqRes.blob();

  const trainingFile = new File([trainingBlob], 'sample-training-data.csv', { type: 'text/csv' });
  const reqFile = new File([reqBlob], 'sample-requirements.csv', { type: 'text/csv' });

  const [trainingResult, reqResult] = await Promise.all([
    importTrainingFile(trainingFile),
    importRequirementsFile(reqFile),
  ]);

  return { trainingResult, reqResult };
}
