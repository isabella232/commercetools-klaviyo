import express from 'express';
import { GenericAdapter } from './genericAdapter.js';
import { processEvent } from '../domain/processEvent.js';
import { MessageDeliveryPayload } from '@commercetools/platform-sdk/dist/declarations/src/generated/models/subscription';
import logger from '../utils/log';

const app = express();
app.use(express.json());

app.post('/', async (req, res) => {
    if (!req.body) {
        const msg = 'no Pub/Sub message received';
        console.error(`error: ${msg}`);
        res.status(400).send(`Bad Request: ${msg}`);
        return;
    }
    if (!req.body.message) {
        const msg = 'invalid Pub/Sub message format';
        console.error(`error: ${msg}`);
        res.status(400).send(`Bad Request: ${msg}`);
        return;
    }

    const pubSubMessage = req.body.message;

    const payload = pubSubMessage.data ? JSON.parse(Buffer.from(pubSubMessage.data, 'base64').toString()) : null;
    // const payload = { resource: { typeId: 'customer' } };
    logger.info('Starting event processing...');
    await processEvent(payload as MessageDeliveryPayload);
    res.status(204).send();
});

//todo should support other types of loggers?
export const cloudRunAdapter: GenericAdapter = (): Promise<any> => {
    const PORT = 6789;
    app.listen(PORT, () => console.log(`klaviyo commercetools plugin listening on port ${PORT}`));
    return new Promise((resolve) => resolve(app));
};
