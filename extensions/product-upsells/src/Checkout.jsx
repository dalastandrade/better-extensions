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
  const {query} = useApi();
  const cartLines = useCartLines();
  const applyCartLinesChange = useApplyCartLinesChange();
  const settings = useSettings();
  const ratingNamespace =
    (settings.rating_namespace || '').toString().trim() || 'custom';
  const ratingKey =
    (settings.rating_key || '').toString().trim() || 'review_rating';
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function fetchRecommendations() {
      const cartProductIds = new Set(
        cartLines.map((line) => line.merchandise.product.id),
      );

      if (cartProductIds.size === 0) {
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
          variants(first: 1) {
            edges {
              node {
                id
                price {
                  amount
                  currencyCode
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

          let products = result?.data?.productRecommendations || [];

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
            products = result?.data?.productRecommendations || [];
          }

          for (const product of products) {
            if (cartProductIds.has(product.id) || seen.has(product.id)) continue;
            seen.add(product.id);

            const image = product.images?.edges?.[0]?.node;
            const variant = product.variants?.edges?.[0]?.node;

            if (variant) {
              const ratingVal = product.rating?.value?.trim();
              allRecs.push({
                productId: product.id,
                title: product.title,
                variantId: variant.id,
                price: variant.price,
                imageUrl: image?.url || '',
                imageAlt: image?.altText || product.title,
                rating: ratingVal ? parseInt(ratingVal, 10) : 5,
              });
            }
          }
        } catch {
          // Skip on error
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
    setAdding(true);
    await applyCartLinesChange({
      type: 'addCartLine',
      merchandiseId: variantId,
      quantity: 1,
    });
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
              <Text size="small" appearance="warning">
                {'★'.repeat(Math.min(Math.max(product.rating, 0), 5))}
                {'☆'.repeat(5 - Math.min(Math.max(product.rating, 0), 5))}
              </Text>
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
