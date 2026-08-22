use core::num::traits::Zero;
use openzeppelin::interfaces::token::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use privacy::objects::OpenNoteDeposit;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, Token, TokenTrait, declare,
    spy_events,
};
use starknet::ContractAddress;
use starkware_utils_testing::test_utils::{TokenHelperTrait, deploy_mock_erc20_token};

use paywall_anonymizer::paywall_anonymizer::{
    IPaywallAnonymizerDispatcher, IPaywallAnonymizerDispatcherTrait, PaywallAnonymizer,
};
use paywall_anonymizer::test_contracts::hostile_tokens::{
    IHostileTokenDispatcher, IHostileTokenDispatcherTrait, IReentrancyControlDispatcher,
    IReentrancyControlDispatcherTrait,
};

const PRICE: u128 = 5_000_000_000_000_000_000; // 5 STRK
const FUNDING: u128 = 8_000_000_000_000_000_000; // 8 STRK
const CHANGE: u128 = FUNDING - PRICE;
const RESOURCE: felt252 = 'article/42';
const NOTE: felt252 = 'CHANGE_NOTE';

fn merchant() -> ContractAddress {
    'MERCHANT'.try_into().unwrap()
}

/// The pool is whoever calls `privacy_invoke`. In these tests that is the test
/// contract itself.
fn pool() -> ContractAddress {
    starknet::get_contract_address()
}

#[derive(Drop, Copy)]
struct Setup {
    token: Token,
    helper: ContractAddress,
}

fn deploy_helper() -> ContractAddress {
    let contract = declare("PaywallAnonymizer").unwrap().contract_class();
    let (helper, _) = ResultTrait::unwrap(contract.deploy(@array![]));
    helper
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

    let helper = deploy_helper();
    token.supply(address: helper, amount: funding);

    Setup { token, helper }
}

fn invoke(s: Setup, price: u128, change_note_id: Option<felt252>) -> Span<OpenNoteDeposit> {
    IPaywallAnonymizerDispatcher { contract_address: s.helper }
        .privacy_invoke(
            merchant: merchant(),
            token: s.token.contract_address(),
            :price,
            resource_hash: RESOURCE,
            :change_note_id,
        )
}

//
// The happy paths.
//

#[test]
fn test_pays_the_merchant_and_returns_change_to_an_open_note() {
    let s = setup(FUNDING);

    let deposits = invoke(s, PRICE, Some(NOTE));

    // The merchant is paid in full, publicly - that is the point of a receipt.
    assert_eq!(s.token.balance_of(address: merchant()), PRICE.into());

    // The change comes back as an open note, whose owner stays hidden.
    assert_eq!(deposits.len(), 1);
    let OpenNoteDeposit { note_id, token, amount } = *deposits[0];
    assert_eq!(note_id, NOTE);
    assert_eq!(token, s.token.contract_address());
    assert_eq!(amount, CHANGE);
}

#[test]
fn test_change_is_approved_so_the_pool_can_pull_it() {
    let s = setup(FUNDING);

    invoke(s, PRICE, Some(NOTE));

    // The pool pulls the deposit itself, so approving is the helper's job.
    let allowance = IERC20Dispatcher { contract_address: s.token.contract_address() }
        .allowance(owner: s.helper, spender: pool());
    assert_eq!(allowance, CHANGE.into());
}

#[test]
fn test_the_pool_pull_empties_the_helper() {
    let s = setup(FUNDING);

    let deposits = invoke(s, PRICE, Some(NOTE));

    // Stand in for the pool applying the deposit it was just handed.
    let erc20 = IERC20Dispatcher { contract_address: s.token.contract_address() };
    erc20.transfer_from(sender: s.helper, recipient: pool(), amount: (*deposits[0]).amount.into());

    // Stateless means stateless: nothing is left behind between transactions.
    assert_eq!(erc20.balance_of(account: s.helper), 0);
}

#[test]
fn test_exact_payment_returns_an_empty_span() {
    let s = setup(PRICE);

    let deposits = invoke(s, PRICE, None);

    // Nothing to credit. An empty span is valid and means "credit nothing".
    assert_eq!(deposits.len(), 0);
    assert_eq!(s.token.balance_of(address: merchant()), PRICE.into());
}

#[test]
fn test_emits_a_receipt_the_merchant_can_match_but_nobody_can_trace() {
    let s = setup(FUNDING);
    let mut spy = spy_events();

    invoke(s, PRICE, Some(NOTE));

    // Everything the merchant needs to grant access, and nothing about who
    // paid: the payer's address appears nowhere in the receipt.
    spy
        .assert_emitted(
            @array![
                (
                    s.helper,
                    PaywallAnonymizer::Event::PaywallPaid(
                        PaywallAnonymizer::PaywallPaid {
                            merchant: merchant(),
                            resource_hash: RESOURCE,
                            token: s.token.contract_address(),
                            price: PRICE,
                        },
                    ),
                ),
            ],
        );
}

//
// The funding is measured, never declared.
//

#[test]
fn test_change_is_whatever_was_actually_withdrawn() {
    // The pool withdrew more than the caller might have expected. The note is
    // credited with what is really there, so nothing can be left behind.
    let dust: u128 = 777;
    let s = setup(FUNDING + dust);

    let deposits = invoke(s, PRICE, Some(NOTE));

    assert_eq!((*deposits[0]).amount, CHANGE + dust);
    assert_eq!(
        IERC20Dispatcher { contract_address: s.token.contract_address() }
            .allowance(owner: s.helper, spender: pool()),
        (CHANGE + dust).into(),
    );
}

#[test]
#[should_panic(expected: 'PAYWALL: change without note')]
fn test_refuses_to_strand_change_when_no_note_was_created() {
    // Claiming an exact payment while the helper still holds a remainder would
    // abandon it in a contract anyone can call.
    let s = setup(FUNDING);
    invoke(s, PRICE, None);
}

#[test]
#[should_panic(expected: 'PAYWALL: note without change')]
fn test_refuses_a_change_note_it_cannot_credit() {
    // The pool rejects a zero-amount deposit and aborts on an open note left
    // undeposited. Fail here instead, where the error says what went wrong.
    let s = setup(PRICE);
    invoke(s, PRICE, Some(NOTE));
}

#[test]
#[should_panic(expected: 'PAYWALL: funding below price')]
fn test_rejects_funding_below_the_price() {
    let s = setup(PRICE - 1);
    invoke(s, PRICE, Some(NOTE));
}

//
// Input validation.
//

#[test]
#[should_panic(expected: 'PAYWALL: zero merchant')]
fn test_rejects_a_zero_merchant() {
    let s = setup(FUNDING);
    IPaywallAnonymizerDispatcher { contract_address: s.helper }
        .privacy_invoke(
            merchant: Zero::zero(),
            token: s.token.contract_address(),
            price: PRICE,
            resource_hash: RESOURCE,
            change_note_id: Some(NOTE),
        );
}

#[test]
#[should_panic(expected: 'PAYWALL: zero token')]
fn test_rejects_a_zero_token() {
    let s = setup(FUNDING);
    IPaywallAnonymizerDispatcher { contract_address: s.helper }
        .privacy_invoke(
            merchant: merchant(),
            token: Zero::zero(),
            price: PRICE,
            resource_hash: RESOURCE,
            change_note_id: Some(NOTE),
        );
}

#[test]
#[should_panic(expected: 'PAYWALL: zero price')]
fn test_rejects_a_zero_price() {
    let s = setup(FUNDING);
    invoke(s, 0, Some(NOTE));
}

#[test]
#[should_panic(expected: 'PAYWALL: zero resource hash')]
fn test_rejects_a_zero_resource_hash() {
    // A receipt nobody can match to an entitlement is not a receipt.
    let s = setup(FUNDING);
    IPaywallAnonymizerDispatcher { contract_address: s.helper }
        .privacy_invoke(
            merchant: merchant(),
            token: s.token.contract_address(),
            price: PRICE,
            resource_hash: 0,
            change_note_id: Some(NOTE),
        );
}

#[test]
#[should_panic(expected: 'PAYWALL: merchant is helper')]
fn test_rejects_paying_the_helper_itself() {
    // Both balance deltas would cancel out, so the checks below would pass on
    // a payment that never left the contract.
    let s = setup(FUNDING);
    IPaywallAnonymizerDispatcher { contract_address: s.helper }
        .privacy_invoke(
            merchant: s.helper,
            token: s.token.contract_address(),
            price: PRICE,
            resource_hash: RESOURCE,
            change_note_id: Some(NOTE),
        );
}

#[test]
#[should_panic(expected: 'PAYWALL: merchant is pool')]
fn test_rejects_paying_the_pool() {
    // Funds would vanish into the pool's balance with no note to show for it.
    let s = setup(FUNDING);
    IPaywallAnonymizerDispatcher { contract_address: s.helper }
        .privacy_invoke(
            merchant: pool(),
            token: s.token.contract_address(),
            price: PRICE,
            resource_hash: RESOURCE,
            change_note_id: Some(NOTE),
        );
}

//
// Hostile tokens.
//

fn deploy_fee_token(fee: u256) -> ContractAddress {
    let contract = declare("FeeOnTransferToken").unwrap().contract_class();
    let mut calldata = array![];
    fee.serialize(ref calldata);
    let (address, _) = ResultTrait::unwrap(contract.deploy(@calldata));
    address
}

#[test]
#[should_panic(expected: 'PAYWALL: merchant shortfall')]
fn test_a_fee_on_transfer_token_reverts_instead_of_shorting_the_merchant() {
    // `transfer` returns true and the merchant is still short. Without the
    // balance check the buyer would believe the resource was paid for.
    let token = deploy_fee_token(1_000);
    let helper = deploy_helper();
    IHostileTokenDispatcher { contract_address: token }
        .mint(recipient: helper, amount: FUNDING.into());

    IPaywallAnonymizerDispatcher { contract_address: helper }
        .privacy_invoke(
            merchant: merchant(),
            :token,
            price: PRICE,
            resource_hash: RESOURCE,
            change_note_id: Some(NOTE),
        );
}

#[test]
#[should_panic(expected: 'PAYWALL: merchant overpaid')]
fn test_a_reentrant_token_cannot_pay_the_merchant_twice_from_one_funding() {
    // The token calls back into `privacy_invoke` mid-transfer, trying to spend
    // the funding twice. The outer call measured the merchant's balance before
    // the callback, so the doubled delta gives it away.
    let contract = declare("ReentrantToken").unwrap().contract_class();
    let (token, _) = ResultTrait::unwrap(contract.deploy(@array![]));
    let helper = deploy_helper();

    IHostileTokenDispatcher { contract_address: token }
        .mint(recipient: helper, amount: (PRICE * 2).into());
    IReentrancyControlDispatcher { contract_address: token }
        .arm(
            :helper,
            merchant: merchant(),
            price: PRICE,
            resource_hash: RESOURCE,
            note_id: NOTE,
        );

    IPaywallAnonymizerDispatcher { contract_address: helper }
        .privacy_invoke(
            merchant: merchant(),
            :token,
            price: PRICE,
            resource_hash: RESOURCE,
            change_note_id: Some(NOTE),
        );
}
