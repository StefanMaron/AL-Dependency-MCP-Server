codeunit 70000 "Test Item Mgmt"
{
    procedure GetItemDescription(ItemNo: Code[20]): Text[100]
    var
        TestItem: Record "Test Item";
    begin
        if TestItem.Get(ItemNo) then
            exit(TestItem.Description);
        exit('');
    end;

    procedure SetItemBlocked(ItemNo: Code[20]; NewBlocked: Boolean)
    var
        TestItem: Record "Test Item";
    begin
        if TestItem.Get(ItemNo) then begin
            TestItem.Blocked := NewBlocked;
            TestItem.Modify(true);
        end;
    end;
}
