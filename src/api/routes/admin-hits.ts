import { Router } from 'express';
import { getHits } from '../middleware/hitCounter';

const router = Router();

router.get('/botindex/admin/hits', (req, res) => {
  const adminId = req.query.adminId;

  if (adminId !== '8063432083') {
    res.status(403).json({ error: 'unauthorized' });
    return;
  }

  res.json(getHits());
});

export default router;
