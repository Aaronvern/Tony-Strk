use core::num::traits::Zero;
use openzeppelin::interfaces::token::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use privacy::objects::OpenNoteDeposit;
use snforge_std::{ContractClassTrait, DeclareResultTrait, Token, TokenTrait, declare};
use starknet::ContractAddress;
use starkware_utils_testing::test_utils::{TokenHelperTrait, deploy_mock_erc20_token};

use paywall_anonymizer::paywall_anonymizer::{
    IPaywallAnonymizerDispatcher, IPaywallAnonymizerDispatcherTrait,
};

const PRICE: u128 = 5_000_000_000_000_000_000; // 5 STRK
const FUNDING: u128 = 8_000_000_000_000_000_000; // 8 STRK
const RESOURCE: felt252 = 'article/42';
const NOTE: felt252 = 'CHANGE_NOTE';

fn merchant() -> ContractAddress {
    'MERCHANT'.try_into().unwrap()
}

#[derive(Drop, Copy)]
struct Setup {
    token: Token,
    helper: ContractAddress,
}

/// Deploys the helper and funds it the way the pool would: a plain transfer in,
/// immediately before `privacy_invoke` is called.
fn setup(funding: u128) -> Setup {
    let token = deploy_mock_erc20_token(
        name: "TonyTestToken",
        symbol: "TTT",
        decimals: 18,
        initial_supply: 1_000_000_000_000_000_000_000_000_u256,
        owner: 'TOKEN_OWNER'.try_into().unwrap(),
    );

    let contract = declare("PaywallAnonymizer").unwrap().contract_class();
    let (helper, _) = ResultTrait::unwrap(contract.deploy(@array![]));

    token.supply(address: helper, amount: funding);

    Setup { token, helper }
}

fn invoke(s: Setup, funding: u128, price: u128) -> Span<OpenNoteDeposit> {
    IPaywallAnonymizerDispatcher { contract_address: s.helper }
        .privacy_invoke(
            merchant: merchant(),
            token: s.token.contract_address(),
            :funding,
            :price,
            resource_hash: RESOURCE,
            change_note_id: NOTE,
        )
}

#[test]
fn test_pays_the_merchant_and_returns_change_to_an_open_note() {
    let s = setup(FUNDING);

    let deposits = invoke(s, FUNDING, PRICE);

    // The merchant is paid in full, publicly - that is the point of a receipt.
    assert_eq!(s.token.balance_of(address: merchant()), PRICE.into());

    // The change comes back as an open note, whose owner stays hidden.
    assert_eq!(deposits.len(), 1);
    let OpenNoteDeposit { note_id, token, amount } = *deposits[0];
    assert_eq!(note_id, NOTE);
    assert_eq!(token, s.token.contract_address());
    assert_eq!(amount, FUNDING - PRICE);
}

#[test]
fn test_change_is_approved_so_the_pool_can_pull_it() {
    let s = setup(FUNDING);

    invoke(s, FUNDING, PRICE);

    // The pool pulls the deposit itself, so approving is the helper's job.
    // The caller in this test stands in for the pool.
    let allowance = IERC20Dispatcher { contract_address: s.token.contract_address() }
        .allowance(owner: s.helper, spender: starknet::get_contract_address());
    assert_eq!(allowance, (FUNDING - PRICE).into());
}

#[test]
fn test_exact_payment_returns_an_empty_span() {
    let s = setup(PRICE);

    let deposits = invoke(s, PRICE, PRICE);

    // Nothing to credit. An empty span is valid and means "credit nothing".
    assert_eq!(deposits.len(), 0);
    assert_eq!(s.token.balance_of(address: merchant()), PRICE.into());
}

#[test]
#[should_panic(expected: 'PAYWALL: funding below price')]
fn test_rejects_funding_below_the_price() {
    let s = setup(PRICE);
    invoke(s, PRICE - 1, PRICE);
}

#[test]
#[should_panic(expected: 'PAYWALL: zero merchant')]
fn test_rejects_a_zero_merchant() {
    let s = setup(FUNDING);
    IPaywallAnonymizerDispatcher { contract_address: s.helper }
        .privacy_invoke(
            merchant: Zero::zero(),
            token: s.token.contract_address(),
            funding: FUNDING,
            price: PRICE,
            resource_hash: RESOURCE,
            change_note_id: NOTE,
        );
}

#[test]
#[should_panic(expected: 'PAYWALL: zero price')]
fn test_rejects_a_zero_price() {
    let s = setup(FUNDING);
    invoke(s, FUNDING, 0);
}
