import {useState, useEffect} from 'react';
import {
  reactExtension,
  useApi,
  useCartLines,
  BlockStack,
  InlineStack,
  Text,
  Heading,
  Button,
  Divider,
  View,
} from '@shopify/ui-extensions-react/checkout';

export default reactExtension(
  'purchase.checkout.block.render',
  () => <ReviewsCarousel />,
);

function ReviewsCarousel() {
  const {query} = useApi();
  const cartLines = useCartLines();
  const [allReviews, setAllReviews] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReviews() {
      const productIds = [
        ...new Set(cartLines.map((line) => line.merchandise.product.id)),
      ];

      if (productIds.length === 0) {
        setAllReviews([]);
        setLoading(false);
        return;
      }

      const reviews = [];

      for (const productId of productIds) {
        try {
          const {data} = await query(
            `query ProductReviews($id: ID!) {
              node(id: $id) {
                ... on Product {
                  author: metafield(namespace: "custom", key: "review_author") { value }
                  title: metafield(namespace: "custom", key: "review_title") { value }
                  body: metafield(namespace: "custom", key: "rating_review") { value }
                  rating: metafield(namespace: "custom", key: "review_rating") { value }
                }
              }
            }`,
            {variables: {id: productId}},
          );

          const node = data?.node;
          const author = node?.author?.value?.trim() || '';
          const title = node?.title?.value?.trim() || '';
          const body = node?.body?.value?.trim() || '';
          const rating = node?.rating?.value?.trim() || '';

          // Only add if at least one field has content
          if (author || title || body || rating) {
            reviews.push({
              review_author: author,
              review_title: title,
              rating_review: body,
              review_rating: rating ? parseInt(rating, 10) : 5,
            });
          }
        } catch {
          // Skip products with errors
        }
      }

      setAllReviews(reviews);
      setLoading(false);
    }

    fetchReviews();
  }, [cartLines, query]);

  if (loading || allReviews.length === 0) {
    return null;
  }

  const review = allReviews[currentIndex];
  const rating =
    review.review_rating != null && !isNaN(review.review_rating)
      ? Math.min(Math.max(Math.round(review.review_rating), 0), 5)
      : 5;
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

  const goToPrev = () => {
    setCurrentIndex((i) => (i === 0 ? allReviews.length - 1 : i - 1));
  };

  const goToNext = () => {
    setCurrentIndex((i) => (i === allReviews.length - 1 ? 0 : i + 1));
  };

  return (
    <BlockStack spacing="base">
      <Heading level={2}>Customer Reviews</Heading>
      <Divider />
      <View border="base" cornerRadius="base" padding="base">
        <BlockStack spacing="tight">
          <Text size="large" appearance="warning">{stars}</Text>
          {review.review_title && (
            <Text emphasis="bold">{review.review_title}</Text>
          )}
          <Text>{review.rating_review || ''}</Text>
          <Text appearance="subdued" size="small">
            — {review.review_author || 'Anonymous'}
          </Text>
        </BlockStack>
      </View>
      {allReviews.length > 1 && (
        <InlineStack inlineAlignment="center" spacing="base">
          <Button kind="plain" onPress={goToPrev}>
            ◀ Prev
          </Button>
          <Text size="small" appearance="subdued">
            {currentIndex + 1} of {allReviews.length}
          </Text>
          <Button kind="plain" onPress={goToNext}>
            Next ▶
          </Button>
        </InlineStack>
      )}
    </BlockStack>
  );
}
