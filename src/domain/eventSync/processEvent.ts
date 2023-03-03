import { MessageDeliveryPayload } from '@commercetools/platform-sdk/dist/declarations/src/generated/models/subscription';
import { CustomerCreatedEventProcessor } from './eventProcessors/customer/customerCreatedEventProcessor';
import { OrderCreatedEvent } from './eventProcessors/order/orderCreatedEvent';
import { AbstractEventProcessor } from './eventProcessors/abstractEventProcessor';
import logger from '../../utils/log';
import { responseHandler } from './responseHandler';
import { CustomerCompanyNameSetEventProcessor } from './eventProcessors/customer/customerCompanyNameSetEventProcessor';
import { OrderStateChangedEvent } from './eventProcessors/order/orderStateChangedEvent';
import { OrderRefundedEvent } from './eventProcessors/order/orderRefundedEvent';
import { CustomerResourceUpdatedEventProcessor } from './eventProcessors/customer/customerResourceUpdatedEventProcessor';
import { isFulfilled } from '../../utils/promise';
import { DummyCurrencyService } from '../shared/services/dummyCurrencyService';
import { KlaviyoService } from '../../infrastructure/driven/klaviyo/KlaviyoService';
import { KlaviyoSdkService } from '../../infrastructure/driven/klaviyo/KlaviyoSdkService';
import { Context } from "../../types/klaviyo-context";
import { DefaultOrderMapper } from "../shared/mappers/DefaultOrderMapper";

const context: Context = {
    klaviyoService: new KlaviyoSdkService(),
    orderMapper: new DefaultOrderMapper(new DummyCurrencyService()),
};

// export const processEvent = (ctMessage: CloudEventsFormat | PlatformFormat) => {
const defaultProcessors: (typeof AbstractEventProcessor)[] = [
    CustomerCreatedEventProcessor,
    CustomerCompanyNameSetEventProcessor,
    OrderCreatedEvent,
    OrderStateChangedEvent,
    OrderRefundedEvent,
    CustomerResourceUpdatedEventProcessor,
];

// class CTEventsProcessor {
//     constructor(private readonly klaviyoService: KlaviyoService, private readonly eventProcessors: (typeof AbstractEventProcessor)[]) {
//     }
//
//     public async processEvent(ctMessage: MessageDeliveryPayload): Promise<ProcessingResult> {
//         return Promise.resolve({
//             status: 'OK',
//         });
//     }
// }

//todo move processEvent to class
export const processEvent = async (
    ctMessage: MessageDeliveryPayload,
    klaviyoService: KlaviyoService,
    eventProcessors: (typeof AbstractEventProcessor)[] = defaultProcessors,
): Promise<ProcessingResult> => {
    // todo check ctMessage.payloadNotIncluded;
    logger.info('Processing commercetools message', ctMessage);
    const klaviyoRequestsPromises = await Promise.allSettled(
        eventProcessors
            .map((eventProcessors) => eventProcessors.instance(ctMessage, context))
            .filter((eventProcessor) => eventProcessor.isEventValid())
            .map((eventProcessor) => eventProcessor.generateKlaviyoEvents()),
    );
    const response = responseHandler(klaviyoRequestsPromises, ctMessage, false);
    if (response.status != 'OK') {
        return response;
    }
    const validRequests = klaviyoRequestsPromises.filter(isFulfilled).map((done) => done.value);
    const klaviyoRequestPromises = validRequests.flat().map((klaviyoEvent) => klaviyoService.sendEventToKlaviyo(klaviyoEvent));
    const results = await Promise.allSettled(klaviyoRequestPromises);
    return responseHandler(results, ctMessage);
};