export const ordersQuery = `
  query GetOrders($cursor: String, $createdAtQuery: String) {
    orders(first: 100, after: $cursor, query: $createdAtQuery) {
      edges {
        node {
          id
          createdAt
          name
          lineItems(first: 50) {
            edges {
              node {
                product { id title }
                quantity
              }
            }
          }
        }
        cursor
      }
      pageInfo { hasNextPage }
    }
  }
`; 