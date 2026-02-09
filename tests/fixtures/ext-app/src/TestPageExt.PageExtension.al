pageextension 70000 "Test Item Card Ext" extends "Test Item Card"
{
    layout
    {
        addlast(General)
        {
            field("Custom Category"; Rec."Custom Category")
            {
                ApplicationArea = All;
            }
            field(Priority; Rec.Priority)
            {
                ApplicationArea = All;
            }
            field("Extended Status"; Rec."Extended Status")
            {
                ApplicationArea = All;
            }
        }
    }
}
