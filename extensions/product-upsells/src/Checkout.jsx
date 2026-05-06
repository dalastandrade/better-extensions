import {useState, useEffect} from 'react';
import {
  reactExtension,
  useApi,
  useCartLines,
  useApplyCartLinesChange,
  useSettings,
  BlockStack,
  InlineStack,
  Text,
  Heading,
  Button,
  Divider,
  Image,
} from '@shopify/ui-extensions-react/checkout';

export default reactExtension(
  'purchase.checkout.block.render',
  () => <ProductUpsells />,
);

function ProductUpsells() {
  console.log('[upsell] render: top');
  const {query} = useApi();
  console.log('[upsell] render: after useApi', typeof query);
  const cartLines = useCartLines();
  console.log('[upsell] render: after useCartLines', cartLines?.length);
  const applyCartLinesChange = useApplyCartLinesChange();
  console.log(
    '[upsell] render: after useApplyCartLinesChange',
    typeof applyCartLinesChange,
  );
  const settings = useSettings();
  console.log('[upsell] render: after useSettings', settings);
  const ratingNamespace =
    (settings.rating_namespace || '').toString().trim() || 'custom';
  const ratingKey =
    (settings.rating_key || '').toString().trim() || 'review_rating';
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    console.log('[upsell] effect run', {
      cartLineCount: cartLines.length,
      cartLines: cartLines.map((l) => ({
        id: l.id,
        productId: l.merchandise?.product?.id,
        title: l.merchandise?.product?.title,
      })),
    });
    async function fetchRecommendations() {
      const cartProductIds = new Set(
        cartLines.map((line) => line.merchandise.product.id),
      );
      console.log('[upsell] cartProductIds', Array.from(cartProductIds));

      if (cartProductIds.size === 0) {
        console.log('[upsell] empty cart, bailing');
        setRecommendations([]);
        setLoading(false);
        return;
      }

      const seen = new Set();
      const allRecs = [];

      const recQuery = `query Recommendations($productId: ID!, $intent: ProductRecommendationIntent!, $ratingNamespace: String!, $ratingKey: String!) {
        productRecommendations(productId: $productId, intent: $intent) {
          id
          title
          images(first: 1) {
            edges {
              node {
                url(transform: {maxWidth: 80, maxHeight: 80})
                altText
              }
            }
          }
          rating: metafield(namespace: $ratingNamespace, key: $ratingKey) {
            value
          }
          variants(first: 50) {
            edges {
              node {
                id
                price {
                  amount
                  currencyCode
                }
                selectedOptions {
                  name
                  value
                }
                sellingPlanAllocations(first: 1) {
                  edges {
                    node {
                      sellingPlan {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`;

      for (const productId of cartProductIds) {
        try {
          let result = await query(recQuery, {
            variables: {
              productId,
              intent: 'COMPLEMENTARY',
              ratingNamespace,
              ratingKey,
            },
          });

          if (result?.errors) {
            console.log('[upsell] complementary errors', productId, result.errors);
          }

          let products = result?.data?.productRecommendations || [];
          console.log('[upsell] complementary count', productId, products.length);

          // Fall back to RELATED if no complementary recommendations
          if (products.length === 0) {
            result = await query(recQuery, {
              variables: {
                productId,
                intent: 'RELATED',
                ratingNamespace,
                ratingKey,
              },
            });
            if (result?.errors) {
              console.log('[upsell] related errors', productId, result.errors);
            }
            products = result?.data?.productRecommendations || [];
            console.log('[upsell] related count', productId, products.length);
          }

          const EXCLUDE_RE = /\b(free|complimentary|gwp|loyalty)\b/i;

          for (const product of products) {
            if (cartProductIds.has(product.id) || seen.has(product.id)) continue;
            if (EXCLUDE_RE.test(product.title || '')) continue;
            seen.add(product.id);

            const image = product.images?.edges?.[0]?.node;
            const variantNodes =
              product.variants?.edges?.map((e) => e.node) || [];
            const hasNoSellingPlan = (v) =>
              (v.sellingPlanAllocations?.edges?.length || 0) === 0;
            const variant =
              variantNodes.find(hasNoSellingPlan) || variantNodes[0];

            console.log('[upsell] product', product.title, {
              productId: product.id,
              variantCount: variantNodes.length,
              variants: variantNodes.map((v) => ({
                id: v.id,
                sellingPlanCount: v.sellingPlanAllocations?.edges?.length || 0,
                selectedOptions: v.selectedOptions,
              })),
              pickedVariantId: variant?.id,
              pickedOptions: variant?.selectedOptions,
              ratingMetafield: product.rating,
              ratingRawValue: product.rating?.value,
            });

            if (variant) {
              const raw = product.rating?.value;
              let ratingAvg = null;
              let ratingCount = null;
              if (raw) {
                try {
                  const parsed = JSON.parse(raw);
                  if (typeof parsed === 'object' && parsed) {
                    if (typeof parsed.reviewAverageValue === 'number') {
                      ratingAvg = parsed.reviewAverageValue;
                    } else if (parsed.reviewAverageValue) {
                      ratingAvg = parseFloat(parsed.reviewAverageValue);
                    }
                    if (typeof parsed.reviewCount === 'number') {
                      ratingCount = parsed.reviewCount;
                    } else if (parsed.reviewCount) {
                      ratingCount = parseInt(parsed.reviewCount, 10);
                    }
                  } else if (typeof parsed === 'number') {
                    ratingAvg = parsed;
                  }
                } catch {
                  const n = parseFloat(raw);
                  if (!Number.isNaN(n)) ratingAvg = n;
                }
              }
              allRecs.push({
                productId: product.id,
                title: product.title,
                variantId: variant.id,
                price: variant.price,
                imageUrl: image?.url || '',
                imageAlt: image?.altText || product.title,
                ratingAvg,
                ratingCount,
              });
            }
          }
        } catch (err) {
          console.log('[upsell] query exception', productId, err);
        }
      }

      setRecommendations(allRecs);
      setLoading(false);
    }

    fetchRecommendations();
  }, [cartLines, query, ratingNamespace, ratingKey]);

  if (loading || recommendations.length === 0) {
    return null;
  }

  // Filter out products that are now in the cart
  const cartProductIds = new Set(
    cartLines.map((line) => line.merchandise.product.id),
  );
  const visible = recommendations.filter(
    (rec) => !cartProductIds.has(rec.productId),
  );

  if (visible.length === 0) {
    return null;
  }

  const shown = visible.slice(0, 3);

  const formatPrice = (price) => {
    const amount = parseFloat(price.amount);
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: price.currencyCode,
    }).format(amount);
  };

  const handleAdd = async (variantId) => {
    console.log('[upsell] add to cart', {variantId});
    setAdding(true);
    const result = await applyCartLinesChange({
      type: 'addCartLine',
      merchandiseId: variantId,
      quantity: 1,
    });
    console.log('[upsell] add result', result);
    setAdding(false);
  };

  return (
    <BlockStack spacing="base">
      <Heading level={2}>You might also like</Heading>
      <Divider />
      {shown.map((product) => (
        <BlockStack
          key={product.productId}
          spacing="tight"
          border="base"
          cornerRadius="base"
          padding="tight"
        >
          <InlineStack spacing="base" blockAlignment="center">
            {product.imageUrl && (
              <Image
                source={product.imageUrl}
                accessibilityDescription={product.imageAlt}
              />
            )}
            <BlockStack spacing="extraTight">
              <Text emphasis="bold" size="small">
                {product.title}
              </Text>
              <Text size="small">{formatPrice(product.price)}</Text>
              {product.ratingAvg != null && (
                <InlineStack spacing="extraTight" blockAlignment="center">
                  <Text size="small" appearance="warning">
                    {(() => {
                      const filled = Math.round(
                        Math.min(Math.max(product.ratingAvg, 0), 5),
                      );
                      return '★'.repeat(filled) + '☆'.repeat(5 - filled);
                    })()}
                  </Text>
                  <Text size="small" appearance="subdued">
                    {product.ratingAvg.toFixed(1)}
                    {product.ratingCount != null
                      ? ` (${product.ratingCount})`
                      : ''}
                  </Text>
                </InlineStack>
              )}
            </BlockStack>
          </InlineStack>
          <Button
            kind="secondary"
            onPress={() => handleAdd(product.variantId)}
            loading={adding}
          >
            Add to cart
          </Button>
        </BlockStack>
      ))}
    </BlockStack>
  );
}
