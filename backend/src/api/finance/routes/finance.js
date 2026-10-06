'use strict';
module.exports = {
  routes: [
    ['GET', '/finance/dashboard', 'dashboard'],
    ['GET', '/finance/accounts', 'accounts'], ['POST', '/finance/accounts', 'createAccount'], ['PUT', '/finance/accounts/:id', 'updateAccount'],
    ['GET', '/finance/categories', 'categories'], ['POST', '/finance/categories', 'createCategory'],
    ['POST', '/finance/transactions', 'createTransaction'], ['POST', '/finance/transactions/reset', 'resetTransactions'], ['PUT', '/finance/transactions/:id', 'updateTransaction'],
    ['GET', '/finance/transactions/:id/receipt', 'getTransactionReceipt'],
    ['POST', '/finance/transactions/:id/delete', 'deleteTransaction'], ['POST', '/finance/transactions/:id/restore', 'restoreTransaction'],
    ['POST', '/finance/installments/:group/settle', 'settleInstallments'],
    ['GET', '/finance/cards', 'cards'], ['POST', '/finance/cards', 'createCard'], ['PUT', '/finance/cards/:id', 'updateCard'], ['POST', '/finance/cards/:id/settle', 'settleCard'],
    ['GET', '/finance/recurrences', 'recurrences'], ['POST', '/finance/recurrences', 'createRecurrence'], ['PUT', '/finance/recurrences/:id', 'updateRecurrence'], ['POST', '/finance/recurrences/:id/complete', 'completeRecurrence'],
    ['GET', '/finance/incomes', 'incomeSources'], ['POST', '/finance/incomes', 'createIncomeSource'], ['PUT', '/finance/incomes/:id', 'updateIncomeSource'], ['POST', '/finance/incomes/:id/receive', 'receiveIncome'],
    ['GET', '/finance/reserves', 'reserves'], ['POST', '/finance/reserves', 'upsertReserve'], ['POST', '/finance/reserves/:id/movement', 'reserveMovement'],
    ['GET', '/finance/goals', 'goals'], ['POST', '/finance/goals', 'createGoal'],
    ['GET', '/finance/budgets', 'budgets'], ['POST', '/finance/budgets', 'upsertBudget'],
    ['GET', '/finance/preferences', 'preferences'], ['PUT', '/finance/preferences', 'updatePreferences'],
    ['POST', '/finance/decision', 'spendDecision'], ['POST', '/finance/month-close', 'closeMonth'],
    ['GET', '/finance/shopping', 'shoppingState'], ['PUT', '/finance/shopping', 'saveShoppingState'],
    ['POST', '/finance/shopping/commit', 'commitShoppingList'],
    ['POST', '/finance/import/rows', 'inspectImport'], ['POST', '/finance/import/confirm', 'confirmImport'],
    ['GET', '/finance/export', 'exportMonth'], ['GET', '/finance/audit', 'audit'],
    ['POST', '/finance/restore', 'restoreBackup'],
    ['GET', '/finance/security/status', 'securityStatus'],
    ['GET', '/finance/security/registration/options', 'registrationOptions'], ['POST', '/finance/security/registration/verify', 'registrationVerify'],
    ['GET', '/finance/security/authentication/options', 'authenticationOptions'], ['POST', '/finance/security/authentication/verify', 'authenticationVerify'],
    ['POST', '/finance/security/credential/remove', 'removeSecurityCredential'],
    ['GET', '/finance/billing', 'billingStatus'], ['POST', '/finance/billing/checkout', 'billingCheckout'],
    ['POST', '/finance/billing/portal', 'billingPortal'], ['POST', '/stripe/webhook', 'stripeWebhook']
  ].map(([method, path, action]) => ({ method, path, handler: `finance.${action}`, config: { auth: false } }))
};
