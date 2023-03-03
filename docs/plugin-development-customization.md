# Plugin development and customization

## Local setup

Software required:

* Node.js v18
* yarn

Checkout the project and from the root run the following command to install the dependencies:

```shell
yarn
```

## Tests
The project includes unit tests, integration tests and end-to-end tests.
To run unit and integration tests:
```shell
yarn test
```

### Unit tests
Unit tests are saved next to the file under test and are named `<file-to-test>.spec.ts`.
Run unit tests only:
```shell
yarn test:unit
```

### Integration tests
Integration tests are saved into `/src/test/integration`. These tests run the whole application but downstream API calls (commercetools and klaviyo) are mocked using the mocking library [nock](https://github.com/nock/nock)
Run integration tests only:
```shell
yarn test:integration
```
When writing a new integration test API requests to downstream services (klaviyo, commercetools) can be intercepted by adding the line `nock.recorder.rec()` at the beginning of the test.
In order to record the requests with nock it's required to call the real downstream APIs. An easy way to do so is to duplicate the `.env.test` file in the root and call it `.env`. Then set in `.env.local` the variables `KLAVIYO_AUTH_KEY` and `CT_API_CLIENT` with your personal API keys that can be generated in [commercetools](https://docs.commercetools.com/merchant-center/api-clients) and [klaviyo](https://www.klaviyo.com/account#api-keys-tab).
Finally, update the dotenv config in `jest.setup.ts` to point to the new env file:
```typescript
dotenv.config({ path: '.env' });
```
The integration tests will now run against the real downstream API and in the log will be printed the nock configuration for each API request.
Look at any of the available integration tests for examples.

### End-to-end tests

To write and run end-to-end tests check the [documentation](e2e-tests.md)


## Plugin internals

### Data flow

#### Realtime events
Realtime events are received via Commercetools subscriptions, processed and transformed into requests for the Klaviyo APIs using a set of event processors that are saved at `src/domain/eventSync/eventProcessors`.  
The following table shows the default Commercetools events handled by the plugin and how they are mapped into Klaviyo.

| Commercetools event | Commercetools subscription event                              | Event processor                                     | Klaviyo result                                 | Klaviyo request                                                                                                                                              | 
|---------------------|---------------------------------------------------------------|-----------------------------------------------------|------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer Created    | `CustomerCreated`                                             | `customer/customerCreatedEventProcessor.ts`         | Profile created                                | [Profile create](https://developers.klaviyo.com/en/reference/create_profile) or [Profile update](https://developers.klaviyo.com/en/reference/update_profile) |
| Customer Updated    | `ResourceUpdated` > `customer`                                | `customer/customerResourceUpdatedEventProcessor.ts` | Profile updated                                | [Profile update](https://developers.klaviyo.com/en/reference/update_profile)                                                                                 |
| Order Created       | `OrderCreated` or `OrderImported` or `OrderCustomerSet`       | `order/orderCreatedEvent.ts`                        | Order placed event and Ordered Products events | [Event create](https://developers.klaviyo.com/en/reference/create_event)                                                                                     |
| Order State Changed | `OrderStateChanged`                                           | `order/orderStateChangedEvent.ts`                   | Order fulfilled / Order cancelled              | [Event create](https://developers.klaviyo.com/en/reference/create_event)                                                                                     |
| Order Refunded      | `PaymentTransactionAdded` or `PaymentTransactionStateChanged` | `order/orderRefundedEvent.ts`                       | Order refunded                                 | [Event create](https://developers.klaviyo.com/en/reference/create_event)                                                                                     |

#### Bulk import
| API endpoint   | Description                | Klaviyo request                                                          |
|----------------|----------------------------|--------------------------------------------------------------------------|
| `/sync/orders` | Sync all orders to Klaviyo | [Event create](https://developers.klaviyo.com/en/reference/create_event) |


### Code structure

![Code structure](./img/code_structure.png)

The source code is organized in the following way:
* **driving adapters (`src/infrastructure/driving`)**: are the application entry point. The application has two different entry points: 
  * real time events: a sample pub/sub and SQS adapters are provided to sync realtime events from pub/sub or SQS queues to klaviyo. A new driving adapter should be provided to handle different services.
  * bulk import: an API adapter is provided to start the bulk sync of data. 
* **driven adapters (`src/infrastructure/driven`)**: these are very specific to this plugin.
  * commercetools: services to interface with the commercetools APIs.
  * klaviyo: services to interface with the Klaviyo APIs. 
* **domain logic  (`src/domain`)**
  * real time events
    * event processors: process a commercetools subscription message and generate a JSON request for Klaviyo using the mappers. Event processors can be added/changed/removed. The list of event processors to be used is passed to the `processEvent` method as input parameter. Also the related Commercetools subscription needs to be configured in order to receive the expected message.
  * bulk import: to bulk import customers, products and orders
  * shared logic: 
    * mappers: logic to convert a commercetools JSON object to a JSON request for Klaviyo APIs.
    * services: shared services

### Configuration

It is possible to change the default behaviour of the plugin by customising the default configuration.  
The configuration files can be found in the `/config` directory.  
The configuration can be different per environment (the env variable `NODE_ENV` is used to select the
current environment), check the [node-config](https://github.com/node-config/node-config#readme) library for more info.

#### Configuration options

| Property                              | Default   | Description                                                                                                                                                                                                                                                      |
|---------------------------------------|-----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `order.states.changed.cancelledOrder` | Cancelled | The commercetools `order.orderState` value that triggers a [Cancelled Order](https://developers.klaviyo.com/en/docs/guide_to_integrating_a_platform_without_a_pre_built_klaviyo_integration#fulfilled-order-cancelled-order-and-refunded-order) event in klaviyo |
| ....                                  | ...       | TODO                                                                                                                                                                                                                                                             |

### Dummy services

Some functionalities are specific to the environment where the plugin is installed or different third party service can
be used. For this reason we provided only the interface of the service with a sample implementation.

| Service           | Sample implementation                           | Description                                                                                                                                                                                                                            |
|-------------------|-------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `CurrencyService` | `src/domain/services/defaultCurrencyService.ts` | Order amounts can be available in different currencies. In order to have a meaningful representation of the data, all amounts should be converted in a single currency. This service should implement the logic to convert currencies. |

### Event processors
#### Available event processors
TODO

#### Creating a new event processors
TODO

### Mappers
TODO

### Error handling

#### Realtime events

commercetools events are sent on the configured queue and consumed by the plugin.  
The event is filtered, transformed and sent to klaviyo using the `processEvent` method.   
The following outcomes are possible:

1. Message sent correctly: klaviyo has accepted the request, and the `processEvent` method returns `status: "OK"`. In
   this
   case the messages should be acknowledged and removed from the queue.
2. Message invalid: klaviyo returned a `4xx` error, the request is invalid or unauthenticated. The `processEvent` method
   logs
   the error and returns `status: "4xx"`, this value can be used to build the custom logic to handle the error, for
   example, to create
   alerts, send a message to a DLQ...
3. Exception: klaviyo returned a `5xx` error, this might be caused by a temporary glitch with the klaviyo API server and
   typically the request should be retried.
   The `processEvent` method throws an error. The `processEvent` caller should catch the error and not acknowledge the
   message to the queue, so that the message can be reprocessed later.

#### Bulk import
The bulk import is typically a long-running process for this reason the request to sync data is running in background and no errors are returned via the API response.
To check the import errors it's required to check the execution logs where it's possible to see the details of any error and the stats.
Example: 

```shell
...
{"level":"info","message":"Historical orders import. Total orders to be imported 497, total klaviyo events: 1510, successfully imported: 218, errored: 1292, elapsed time: 40 seconds"}
...
```

### Security
#### Secrets
The klaviyo API key is passed via an environment variable. When deployed on the cloud, use your cloud specific secrets
manager to store and retrieve the key.

#### API endpoints
The bulk import of data into Klaviyo can be triggered via API calls. The API endpoints should be protected via authentication or only accessible in a private network.

## Terraform and deploy from local environment

For all the details about the infrastructure configuration check the [infrastructure documentation](infrastructure.md)

### Authentication
Use an existing service account key or generate a new one:

```shell
gcloud iam service-accounts keys create ./klaviyo-gcp-key.json --iam-account terraform@klaviyo-ct-plugin.iam.gserviceaccount.com
```

- Authenticate to Google Cloud platform using the terraform service account key:

```shell
gcloud auth activate-service-account terraform@klaviyo-ct-plugin.iam.gserviceaccount.com --key-file=/path-to-your-key/klaviyo-ct-plugin-a5c9b42d8e43.json --project=klaviyo-ct-plugin
```

Add environment variable:
`export GOOGLE_APPLICATION_CREDENTIALS=~/path-to-your-key/klaviyo-ct-plugin-a5c9b42d8e43.json`

Create a new file `infrastructure/environment/credentials.tfvars` with the following content:

```terraform
ct_client_id     = "<add-your-commercetools-client-id>"
ct_secret        = "<add-your-commercetools-secret>"
klaviyo_auth_key = "<add-your-klaviyo-auth-key>"
  ```

### Running terraform

```shell
cd infrastructure
```

```shell
./terraform.sh apply dev
```

### Build and deployment to Cloud Run

Authenticate with Google Cloud platform.
Authenticate with your Google account if owner of the project.

```shell
#run only once
gcloud auth application-default login
```

OR authenticate with service account key

```shell
gcloud auth activate-service-account terraform@klaviyo-ct-plugin.iam.gserviceaccount.com --key-file=/Users/roberto.losanno/work/klaviyo/gcp/klaviyo-ct-plugin-a5c9b42d8e43.json --project=klaviyo-ct-plugin    

#export GOOGLE_APPLICATION_CREDENTIALS=~/path-to-you-service-acccount-key.json
```

```shell
#run only once
gcloud auth configure-docker us-central1-docker.pkg.dev
```

```shell
docker build -t klaviyo-ct-plugin .
```  

```shell
docker tag klaviyo-ct-plugin us-central1-docker.pkg.dev/klaviyo-ct-plugin/docker-repo/klaviyo-ct-plugin
```    

```shell
docker push us-central1-docker.pkg.dev/klaviyo-ct-plugin/docker-repo/klaviyo-ct-plugin
```  

```shell
gcloud run services update dev-klaviyo-ct-plugin-bulk-import \
--image us-central1-docker.pkg.dev/klaviyo-ct-plugin/docker-repo/klaviyo-ct-plugin \
--region=us-central1 \
--port 6779 \
--max-instances=5 \
--update-secrets=KLAVIYO_AUTH_KEY=klaviyo_auth_key:latest \
--update-secrets=CT_API_CLIENT=commercetools_api_client:latest
```
