import { Order } from '@commercetools/platform-sdk';
import logger from '../../../utils/log';
import { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import { CtOrderService } from "./CtOrderService";

export type PaginatedOrderResults = {
    data: Order[];
    hasMore: boolean;
    lastId?: string;
};

export class DefaultCtOrderService implements CtOrderService{
    constructor(private readonly ctApiRoot: ByProjectKeyRequestBuilder, private readonly limit = 20) {}

    getAllOrders = async (lastId?: string): Promise<PaginatedOrderResults> => {
        logger.info(`Getting all orders in commercetools with id after ${lastId}`);
        try {
            const queryArgs = lastId
                ? { limit: this.limit, withTotal: false, sort: 'id asc', where: `id > "${lastId}"` }
                : { limit: this.limit, withTotal: false, sort: 'id asc' };
            const ctOrders = (await this.ctApiRoot.orders().get({ queryArgs }).execute()).body;
            return {
                data: ctOrders.results,
                hasMore: Boolean(ctOrders.count === this.limit),
                lastId: ctOrders.results.length > 0 ? ctOrders.results[ctOrders.results.length - 1].id : undefined,
            };
        } catch (error) {
            logger.error(error);
            throw error;
        }
    };
}